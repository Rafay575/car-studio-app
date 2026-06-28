# backend/main.py
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image, ImageDraw, ImageFilter
import io
import base64
import rembg
import uuid
import os
import time
from datetime import datetime
from threading import Lock

app = FastAPI()

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ CONFIGURATION ------------------
TEMP_DIR = "./temp"
os.makedirs(TEMP_DIR, exist_ok=True)

# ------------------ TASK STORE (in-memory) ------------------
tasks = {}  # task_id -> {status, original_path, processed_path, error, created_at}
task_lock = Lock()

def update_task(task_id: str, **kwargs):
    with task_lock:
        if task_id in tasks:
            tasks[task_id].update(kwargs)

# ------------------ LOAD YOLO MODEL ------------------
model = YOLO('yolov8n.pt')
VEHICLE_CLASSES = {2, 3, 5, 7}

def image_contains_vehicle(image_bytes: bytes) -> bool:
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        results = model(img, verbose=False)
        for r in results:
            boxes = r.boxes
            if boxes is not None:
                for box in boxes:
                    cls = int(box.cls[0])
                    if cls in VEHICLE_CLASSES:
                        return True
        return False
    except Exception as e:
        print(f"YOLO detection error: {e}")
        return False

# ------------------ BACKGROUND REPLACEMENT PIPELINE ------------------
def create_floor_shadow(car_mask: Image.Image, original_size: tuple) -> Image.Image:
    bbox = car_mask.getbbox()
    if not bbox:
        return Image.new("RGBA", original_size, (0, 0, 0, 0))
    x0, y0, x1, y1 = bbox
    width = x1 - x0
    height = y1 - y0
    shadow = Image.new("RGBA", original_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    center_x = (x0 + x1) // 2
    bottom_y = y1
    shadow_width = int(width * 0.9)
    shadow_height = int(height * 0.15)
    draw.ellipse(
        (
            center_x - shadow_width // 2,
            bottom_y - shadow_height // 2,
            center_x + shadow_width // 2,
            bottom_y + shadow_height // 2,
        ),
        fill=(0, 0, 0, 80)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=20))
    return shadow

def process_car_image(image_bytes: bytes) -> bytes:
    original = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    with_alpha = rembg.remove(original, alpha_matting=False)
    mask = with_alpha.split()[-1]
    # mask = mask.filter(ImageFilter.GaussianBlur(radius=1))  # optional
    bg = Image.new("RGBA", original.size, (245, 245, 245, 255))
    car_with_alpha = original.copy()
    car_with_alpha.putalpha(mask)
    composed = Image.alpha_composite(bg, car_with_alpha)
    shadow = create_floor_shadow(mask, original.size)
    composed = Image.alpha_composite(composed, shadow)
    output = io.BytesIO()
    composed.convert("RGB").save(output, format="JPEG", quality=95)
    return output.getvalue()

# ------------------ BACKGROUND TASK ------------------
def process_task(task_id: str, image_bytes: bytes):
    try:
        # Save original temporarily (optional)
        original_path = os.path.join(TEMP_DIR, f"{task_id}_original.jpg")
        with open(original_path, "wb") as f:
            f.write(image_bytes)
        update_task(task_id, original_path=original_path, status="processing")

        # Check if image contains a car
        if not image_contains_vehicle(image_bytes):
            update_task(task_id, status="failed", error="No car detected in image.")
            return

        # Process image
        processed_bytes = process_car_image(image_bytes)
        processed_path = os.path.join(TEMP_DIR, f"{task_id}_processed.jpg")
        with open(processed_path, "wb") as f:
            f.write(processed_bytes)

        update_task(task_id, status="completed", processed_path=processed_path)
    except Exception as e:
        update_task(task_id, status="failed", error=str(e))

# ------------------ API ENDPOINTS ------------------
@app.post("/upload-bulk")
async def upload_bulk(files: list[UploadFile] = File(...), background_tasks: BackgroundTasks = None):
    """
    Accept multiple images, create tasks, and start processing in background.
    Returns list of task IDs.
    """
    task_ids = []
    for file in files:
        task_id = str(uuid.uuid4())
        content = await file.read()
        # Store task
        with task_lock:
            tasks[task_id] = {
                "status": "pending",
                "original_filename": file.filename,
                "original_path": None,
                "processed_path": None,
                "error": None,
                "created_at": datetime.now().isoformat(),
            }
        # Trigger background processing
        background_tasks.add_task(process_task, task_id, content)
        task_ids.append({"task_id": task_id, "filename": file.filename})
    
    return {"tasks": task_ids}

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    with task_lock:
        if task_id not in tasks:
            raise HTTPException(status_code=404, detail="Task not found")
        task = tasks[task_id]
    # Return a copy
    return {
        "task_id": task_id,
        "status": task["status"],
        "original_filename": task.get("original_filename"),
        "processed_path": task.get("processed_path"),
        "error": task.get("error"),
        "created_at": task.get("created_at"),
    }

@app.get("/download/{task_id}")
async def download_image(task_id: str):
    with task_lock:
        if task_id not in tasks:
            raise HTTPException(status_code=404, detail="Task not found")
        task = tasks[task_id]
        if task["status"] != "completed":
            raise HTTPException(status_code=400, detail="Image not ready yet")
        file_path = task["processed_path"]
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Processed file not found")
    return FileResponse(file_path, media_type="image/jpeg", filename=f"{task_id}.jpg")

@app.get("/")
async def root():
    return {"message": "AI Car Studio Backend (Bulk + Async)"}

@app.get("/original/{task_id}")
async def get_original(task_id: str):
    with task_lock:
        if task_id not in tasks:
            raise HTTPException(status_code=404, detail="Task not found")
        task = tasks[task_id]
        original_path = task.get("original_path")
        if not original_path or not os.path.exists(original_path):
            raise HTTPException(status_code=404, detail="Original file not found")
    return FileResponse(original_path, media_type="image/jpeg", filename=f"{task_id}_original.jpg")
    
# Keep old endpoint for backward compatibility (optional)
@app.post("/process-image")
async def process_image_sync(file: UploadFile = File(...)):
    contents = await file.read()
    if not image_contains_vehicle(contents):
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "This image does not contain a car or vehicle.",
                "contains_car": False,
                "image_base64": None,
            }
        )
    try:
        processed_bytes = process_car_image(contents)
        image_base64 = base64.b64encode(processed_bytes).decode("utf-8")
        return {
            "status": "success",
            "message": "✅ Background replaced with premium studio (car unaltered).",
            "contains_car": True,
            "image_base64": image_base64,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Image processing failed: {str(e)}",
                "contains_car": True,
                "image_base64": None,
            }
        )