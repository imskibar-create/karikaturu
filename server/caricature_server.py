"""FastAPI backend for caricature generation using Stability AI API."""
import base64
import os
import io
import requests

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

STABILITY_API_KEY = os.environ.get("STABILITY_API_KEY", "")
STABILITY_URL = "https://api.stability.ai/v2beta/stable-image/generate/sd3"

# ---------------------------------------------------------------------------
# Intensity → image strength mapping
# Higher strength = more creative freedom (more cartoon, less photo)
# ---------------------------------------------------------------------------
INTENSITY_STRENGTH = {
    1: 0.35,   # Very close to original
    2: 0.52,   # Mild stylization
    3: 0.68,   # Classic caricature (previous default)
    4: 0.82,   # Strong exaggeration
    5: 0.95,   # Maximum caricature
}

STYLE_PROMPTS = {
    "cartoon": {
        1: "Redraw as a cartoon illustration with bold outlines and bright colors. Stay very close to original proportions, just apply the art style.",
        2: "Cartoon illustration with mild stylization. Slightly bigger eyes, softer features. Faithful to original appearance.",
        3: "Funny cartoon caricature with bold outlines and bright vivid colors. Bigger eyes, wider smile, expressive hair. Clearly recognizable.",
        4: "Strong cartoon caricature. Giant sparkly eyes, enormous toothy grin, wild hair, exaggerated head size. Hilariously funny.",
        5: "MAXIMUM cartoon caricature. Eyes take up half the face, smile ear to ear, hair explodes outward, tiny body. Completely absurd and hilarious.",
    },
    "comic": {
        1: "Comic book art style with bold outlines and primary colors. Accurate proportions, no exaggeration.",
        2: "Mild comic book caricature. Slightly bolder features, clean black outlines, halftone dot texture.",
        3: "Comic book caricature with bold outlines, halftone dots, POW speech bubble. Dynamic energy, clear exaggeration.",
        4: "Strong superhero comic caricature. Dramatic bold exaggeration, action lines, large POW element, dynamic pose.",
        5: "EXTREME comic book caricature. Wildly distorted features, massive jaw or eyes, explosive action lines, giant POW speech bubble.",
    },
    "watercolor": {
        1: "Gentle watercolor portrait with soft pastel washes and ink line work. Almost no exaggeration, flattering.",
        2: "Soft watercolor illustration, very mild feature enhancement. Loose pastel washes, delicate ink lines.",
        3: "Playful watercolor caricature with loose washes. Bigger expressive eyes, rosy cheeks, warm exaggerated smile.",
        4: "Whimsical watercolor with strong exaggeration. Large expressive eyes, bold brushstrokes, vivid colors.",
        5: "MAXIMUM watercolor caricature. Hugely exaggerated features, almost abstract loose brushstrokes, wildly expressive.",
    },
    "chibi": {
        1: "Slightly chibi-fied portrait. Mildly bigger eyes, cute proportions, still realistic.",
        2: "Mild chibi anime style. Bigger eyes, rounded cute features, small body.",
        3: "Classic chibi anime style. Head 2/3 of body, large shiny eyes, kawaii aesthetic, pastel colors.",
        4: "Very chibi. Enormous head, giant sparkling eyes, tiny dot nose and mouth, super kawaii.",
        5: "MAXIMUM chibi. Just a giant cute head, eyes are massive glittering orbs, tiny stub body, impossibly kawaii.",
    },
    "pencil": {
        1: "Realistic pencil sketch portrait with very subtle editorial cartoon touches. Close to the photo.",
        2: "Light editorial pencil caricature. Gentle feature enhancement, crosshatching shading, newspaper style.",
        3: "Classic newspaper editorial pencil caricature. Most prominent feature noticeably enlarged, bold strokes.",
        4: "Strong political cartoon pencil caricature. Dominant features hugely exaggerated, expressive crosshatching.",
        5: "MAXIMUM editorial pencil caricature. Most prominent facial feature dominates the entire face. Extreme political cartoon distortion.",
    },
}

STYLE_NEGATIVE = {
    "cartoon": "photorealistic, blurry, ugly, deformed",
    "comic": "photorealistic, watercolor, sketch, blurry",
    "watercolor": "photorealistic, sharp lines, comic book, blurry",
    "chibi": "photorealistic, realistic proportions, dark, blurry",
    "pencil": "color, photorealistic, painting, blurry",
}


def build_prompt(style: str, intensity: int) -> tuple[str, str]:
    prompts = STYLE_PROMPTS.get(style, STYLE_PROMPTS["cartoon"])
    prompt = prompts.get(intensity, prompts[3])
    negative = STYLE_NEGATIVE.get(style, "blurry, ugly, deformed")
    return prompt, negative


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.post("/api/generate")
async def generate_caricature(
    file: UploadFile = File(...),
    style: str = Form(default="cartoon"),
    intensity: int = Form(default=3),
):
    if not STABILITY_API_KEY:
        raise HTTPException(status_code=500, detail="STABILITY_API_KEY not configured")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    intensity = max(1, min(5, intensity))
    prompt, negative_prompt = build_prompt(style, intensity)
    strength = INTENSITY_STRENGTH[intensity]

    try:
        response = requests.post(
            STABILITY_URL,
            headers={
                "authorization": f"Bearer {STABILITY_API_KEY}",
                "accept": "image/*",
            },
            files={"image": (file.filename or "photo.jpg", io.BytesIO(image_bytes), file.content_type)},
            data={
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "mode": "image-to-image",
                "strength": str(strength),
                "model": "sd3.5-large-turbo",  # 4 credits, fast, good quality
                "output_format": "png",
            },
            timeout=120,
        )

        if response.status_code == 200:
            b64_out = base64.b64encode(response.content).decode()
            return JSONResponse({
                "image": f"data:image/png;base64,{b64_out}",
                "style": style,
                "intensity": intensity,
            })
        else:
            try:
                err = response.json()
                detail = err.get("errors", [str(err)])[0] if isinstance(err, dict) else str(err)
            except Exception:
                detail = response.text[:300]
            raise HTTPException(status_code=400, detail=f"Stability AI error: {detail}")

    except requests.exceptions.Timeout:
        raise HTTPException(status_code=408, detail="Generation timed out, please try again")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Generation failed: {str(e)}")


@app.get("/api/styles")
async def get_styles():
    return {
        "styles": [
            {"id": "cartoon",    "name": "Мультяшный", "emoji": "🎨", "desc": "Яркий комикс-стиль"},
            {"id": "comic",      "name": "Комикс",     "emoji": "💥", "desc": "Супергеройский POW!"},
            {"id": "watercolor", "name": "Акварель",   "emoji": "🖌️", "desc": "Мягкая акварель"},
            {"id": "chibi",      "name": "Чиби",       "emoji": "🌸", "desc": "Аниме-кавай"},
            {"id": "pencil",     "name": "Карандаш",   "emoji": "✏️", "desc": "Газетный шарж"},
        ]
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve built React frontend (catch-all, must be last)
# ---------------------------------------------------------------------------
import pathlib
from fastapi.responses import FileResponse

STATIC_DIR = pathlib.Path(__file__).parent.parent / "dist" / "public"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(str(STATIC_DIR / "index.html"))
