"""FastAPI backend for caricature generation using Replicate API."""
import base64
import os
import httpx

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import replicate

app = FastAPI()

# Allow requests from any origin (frontend can be hosted anywhere)
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Prompt builders per style × intensity
# ---------------------------------------------------------------------------

STYLE_BASES = {
    "cartoon": {
        "medium": "cartoon illustration with bold outlines, bright vivid colors, playful comic book style",
        1: "Redraw as a cartoon illustration, very close to original proportions, only the art style changes. Flattering, no exaggeration.",
        2: "Cartoon illustration with very mild stylization. Features barely softened. Stays faithful to original appearance.",
        3: "Funny cartoon caricature. Noticeably exaggerated — bigger eyes, wider smile, expressive hair. Clearly recognizable and comedic.",
        4: "Strong cartoon caricature. Hugely exaggerated features — giant sparkly eyes, enormous toothy grin, wild hair. Hilariously funny.",
        5: "MAXIMUM cartoon caricature. Eyes take up half the face, smile stretches ear to ear, hair explodes outward, head enormous compared to tiny body. Completely absurd.",
    },
    "comic": {
        "medium": "comic book illustration with halftone dot patterns, bold black outlines, primary colors",
        1: "Comic book art style, accurate proportions, clean bold outlines, subtle coloring. No exaggeration.",
        2: "Mild comic book style caricature. Slightly bolder features, clean outlines. Very close to original.",
        3: "Comic book caricature with POW! speech bubble. Dynamic energy, clear feature exaggeration.",
        4: "Strong superhero comic caricature. Dramatic bold exaggeration, action lines, large POW! element.",
        5: "EXTREME comic book caricature. Wildly distorted heroic features, massive jaw or eyes, explosive action lines everywhere, giant POW! speech bubble.",
    },
    "watercolor": {
        "medium": "loose watercolor washes in pastel tones with ink line work, charming illustration style",
        1: "Gentle watercolor portrait, almost no exaggeration. Soft and flattering.",
        2: "Soft watercolor illustration, very mild feature enhancement. Pastel tones, ink lines.",
        3: "Playful watercolor caricature. Bigger expressive eyes, rosy cheeks, warm smile.",
        4: "Whimsical watercolor with strong exaggeration. Large expressive eyes, bold expression.",
        5: "MAXIMUM watercolor caricature. Hugely exaggerated features in loose expressive brushstrokes, almost abstract level of distortion.",
    },
    "chibi": {
        "medium": "cute chibi anime style, round shapes, pastel colors, kawaii aesthetic",
        1: "Slightly chibi-fied portrait. Mildly bigger eyes, tiny cute proportions, still realistic.",
        2: "Mild chibi style. Somewhat bigger eyes, rounded features, small cute body.",
        3: "Classic chibi. Head about 2/3 of body, large shiny eyes, tiny cute features.",
        4: "Very chibi. Enormous head almost all body, giant sparkling eyes, tiny dot nose and mouth.",
        5: "MAXIMUM chibi. The entire image is basically just the huge head, eyes are massive glittering orbs, body is a tiny stub.",
    },
    "pencil": {
        "medium": "pencil sketch editorial newspaper cartoon style, crosshatching shading, confident strokes",
        1: "Realistic pencil sketch portrait. Very subtle editorial cartoon touches, close to photo.",
        2: "Light pencil caricature sketch. Gentle feature enhancement, crosshatching shading.",
        3: "Classic editorial pencil caricature. Most prominent feature noticeably enlarged.",
        4: "Strong newspaper pencil caricature. Dominant features hugely exaggerated, expressive.",
        5: "MAXIMUM editorial pencil caricature. Most prominent facial feature takes up most of the face. Extreme distortion like a political cartoon.",
    },
}


def build_prompt(style: str, intensity: int) -> str:
    base = STYLE_BASES.get(style, STYLE_BASES["cartoon"])
    desc = base.get(intensity, base[3])
    medium = base["medium"]
    return (
        f"Transform this photo into a {medium}. "
        f"{desc} "
        "Keep the person identifiable. High quality illustration output."
    )


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.post("/api/generate")
async def generate_caricature(
    file: UploadFile = File(...),
    style: str = Form(default="cartoon"),
    intensity: int = Form(default=3),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    intensity = max(1, min(5, intensity))
    prompt = build_prompt(style, intensity)

    # Encode image as data URI for Replicate
    b64_input = base64.b64encode(image_bytes).decode()
    mime = file.content_type or "image/jpeg"
    image_data_uri = f"data:{mime};base64,{b64_input}"

    try:
        output = replicate.run(
            "black-forest-labs/flux-kontext-pro",
            input={
                "prompt": prompt,
                "input_image": image_data_uri,
                "aspect_ratio": "1:1",
                "output_format": "png",
                "safety_tolerance": 2,
            },
        )

        image_url = str(output)

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            result_bytes = resp.content

        b64_out = base64.b64encode(result_bytes).decode()
        return JSONResponse({
            "image": f"data:image/png;base64,{b64_out}",
            "style": style,
            "intensity": intensity,
        })

    except replicate.exceptions.ReplicateError as e:
        raise HTTPException(status_code=400, detail=f"Replicate error: {str(e)}")
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
# Serve built React frontend (must be LAST — catch-all)
# ---------------------------------------------------------------------------
import pathlib

STATIC_DIR = pathlib.Path(__file__).parent.parent / "dist" / "public"

if STATIC_DIR.exists():
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(str(STATIC_DIR / "index.html"))
