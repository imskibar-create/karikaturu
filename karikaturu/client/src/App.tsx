import { useState, useRef, useCallback } from "react";
import { Loader2, Upload, Download, RefreshCw, Sparkles, Camera } from "lucide-react";

// In production (Railway) VITE_API_URL is set to the Railway backend URL.
// In the Perplexity preview __PORT_8000__ is rewritten to the sandbox proxy path.
// Locally both are empty so relative paths work via Vite proxy.
const _PORT_TOKEN = '__PORT_8000__';
const API_BASE =
  import.meta.env.VITE_API_URL ||
  (_PORT_TOKEN.startsWith('__') ? '' : _PORT_TOKEN);

interface Style {
  id: string;
  name: string;
  emoji: string;
  desc: string;
}

const STYLES: Style[] = [
  { id: "cartoon", name: "Мультяшный", emoji: "🎨", desc: "Яркий комикс-стиль" },
  { id: "comic", name: "Комикс", emoji: "💥", desc: "Супергеройский POW!" },
  { id: "watercolor", name: "Акварель", emoji: "🖌️", desc: "Мягкая акварель" },
  { id: "chibi", name: "Чиби", emoji: "🌸", desc: "Аниме-кавай" },
  { id: "pencil", name: "Карандаш", emoji: "✏️", desc: "Газетный шарж" },
];

const INTENSITY_LABELS: Record<number, { label: string; emoji: string; desc: string }> = {
  1: { label: "Портрет", emoji: "🖼️", desc: "Почти без изменений — просто стиль" },
  2: { label: "Мягкий", emoji: "😊", desc: "Лёгкая стилизация, черты почти натуральные" },
  3: { label: "Умеренный", emoji: "😄", desc: "Классический шарж — узнаваемо и смешно" },
  4: { label: "Сильный", emoji: "😂", desc: "Заметное преувеличение черт лица" },
  5: { label: "Максимум", emoji: "🤣", desc: "Полный абсурд — максимальный шарж!" },
};

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("cartoon");
  const [intensity, setIntensity] = useState(3);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Пожалуйста, загрузи изображение (JPG, PNG, WEBP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Файл слишком большой. Максимум 10 МБ.");
      return;
    }
    setError(null);
    setResultImage(null);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleGenerate = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);
    setResultImage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("style", selectedStyle);
    formData.append("intensity", String(intensity));

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Неизвестная ошибка" }));
        throw new Error(err.detail || `Ошибка ${res.status}`);
      }
      const data = await res.json();
      setResultImage(data.image);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Не получилось создать шарж: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = `karikaturn-${selectedStyle}-i${intensity}-${Date.now()}.png`;
    a.click();
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResultImage(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const currentStyle = STYLES.find((s) => s.id === selectedStyle)!;
  const currentIntensity = INTENSITY_LABELS[intensity];

  // Slider track fill percentage
  const sliderFill = ((intensity - 1) / 4) * 100;

  return (
    <div className="blob-bg min-h-screen" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <header className="w-full px-4 py-5 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="text-4xl animate-float" style={{ display: "inline-block" }}>🎭</span>
          <div>
            <h1
              className="text-3xl font-black leading-none"
              style={{ fontFamily: "var(--font-display)", color: "hsl(var(--primary))" }}
            >
              КарикатурА
            </h1>
            <p className="text-sm font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
              AI-шарж из твоего фото
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm"
          style={{ background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" }}>
          <Sparkles size={16} />
          Beta
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {/* Hero */}
        {!selectedFile && (
          <div className="text-center mb-8 mt-2">
            <h2 className="text-4xl font-black mb-3" style={{ color: "hsl(var(--foreground))", lineHeight: 1.15 }}>
              Стань{" "}
              <span className="squiggle" style={{ color: "hsl(var(--primary))" }}>
                персонажем
              </span>{" "}
              из мультфильма!
            </h2>
            <p className="text-lg font-medium" style={{ color: "hsl(var(--muted-foreground))", maxWidth: "480px", margin: "0 auto" }}>
              Загрузи своё фото и AI превратит тебя в весёлый рисованный шарж
            </p>
          </div>
        )}

        <div className={`grid gap-6 ${resultImage ? "md:grid-cols-2" : "grid-cols-1"}`}>
          {/* Left column — Upload + Controls */}
          <div className="space-y-5">
            {/* Upload zone */}
            <div
              className={`upload-zone flex flex-col items-center justify-center gap-4 p-8 ${isDragOver ? "drag-over" : ""}`}
              style={{ minHeight: selectedFile ? "220px" : "280px", background: "hsl(var(--card))" }}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              data-testid="upload-zone"
            >
              {selectedFile && previewUrl ? (
                <div className="w-full flex flex-col items-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Загруженное фото"
                    className="rounded-2xl object-cover"
                    style={{ maxHeight: "200px", maxWidth: "100%", width: "auto" }}
                    data-testid="img-preview"
                  />
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
                    <Camera size={15} />
                    {selectedFile.name}
                  </div>
                  <button
                    className="btn-secondary text-sm py-2 px-4"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    data-testid="button-change-photo"
                  >
                    Сменить фото
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="rounded-full p-5"
                    style={{ background: "hsl(var(--primary) / 0.1)" }}
                  >
                    <Upload size={40} style={{ color: "hsl(var(--primary))" }} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg" style={{ color: "hsl(var(--foreground))" }}>
                      Перетащи фото сюда
                    </p>
                    <p className="font-medium text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                      или нажми, чтобы выбрать
                    </p>
                    <p className="text-xs mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                      JPG, PNG, WEBP — до 10 МБ
                    </p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              data-testid="input-file"
            />

            {selectedFile && (
              <>
                {/* Style selector */}
                <div>
                  <p className="font-bold text-base mb-3" style={{ color: "hsl(var(--foreground))" }}>
                    Стиль шаржа
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {STYLES.map((style) => (
                      <button
                        key={style.id}
                        className={`style-card p-2 flex flex-col items-center gap-1 text-center ${selectedStyle === style.id ? "selected" : ""}`}
                        onClick={() => setSelectedStyle(style.id)}
                        data-testid={`button-style-${style.id}`}
                        title={style.desc}
                      >
                        <span className="text-2xl">{style.emoji}</span>
                        <span className="text-xs font-bold leading-tight" style={{ color: "hsl(var(--foreground))" }}>
                          {style.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intensity slider */}
                <div
                  className="rounded-2xl p-5"
                  style={{ background: "hsl(var(--card))", border: "2px solid hsl(var(--border))" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-base" style={{ color: "hsl(var(--foreground))" }}>
                      Уровень шаржирования
                    </p>
                    <span
                      className="px-3 py-1 rounded-full text-sm font-bold"
                      style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
                    >
                      {currentIntensity.emoji} {currentIntensity.label}
                    </span>
                  </div>

                  {/* Custom slider */}
                  <div className="relative mb-4" style={{ paddingBottom: "2px" }}>
                    {/* Track background */}
                    <div
                      className="absolute top-1/2 left-0 right-0 rounded-full"
                      style={{
                        height: "8px",
                        transform: "translateY(-50%)",
                        background: "hsl(var(--border))",
                      }}
                    />
                    {/* Track fill */}
                    <div
                      className="absolute top-1/2 left-0 rounded-full"
                      style={{
                        height: "8px",
                        width: `${sliderFill}%`,
                        transform: "translateY(-50%)",
                        background: `linear-gradient(to right, hsl(190 95% 45%), hsl(var(--primary)))`,
                        transition: "width 0.15s ease",
                      }}
                    />
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={intensity}
                      onChange={(e) => setIntensity(Number(e.target.value))}
                      className="intensity-slider relative w-full"
                      style={{ height: "32px", cursor: "pointer" }}
                      data-testid="slider-intensity"
                    />
                  </div>

                  {/* Step labels */}
                  <div className="flex justify-between">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        onClick={() => setIntensity(v)}
                        className="flex flex-col items-center gap-1 group"
                        style={{ width: "20%" }}
                        data-testid={`button-intensity-${v}`}
                      >
                        <span
                          className="text-lg transition-transform"
                          style={{
                            transform: intensity === v ? "scale(1.35)" : "scale(1)",
                            transition: "transform 0.15s ease",
                          }}
                        >
                          {INTENSITY_LABELS[v].emoji}
                        </span>
                        <span
                          className="text-xs font-bold text-center leading-tight"
                          style={{
                            color: intensity === v ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                            transition: "color 0.15s ease",
                          }}
                        >
                          {INTENSITY_LABELS[v].label}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p
                    className="text-sm font-medium mt-3 text-center"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    {currentIntensity.desc}
                  </p>
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div
                className="rounded-2xl p-4 font-semibold text-sm"
                style={{ background: "hsl(var(--destructive) / 0.1)", color: "hsl(var(--destructive))" }}
                data-testid="text-error"
              >
                ⚠️ {error}
              </div>
            )}

            {/* Action buttons */}
            {selectedFile && (
              <div className="flex gap-3">
                <button
                  className="btn-primary flex items-center gap-2 flex-1 justify-center"
                  onClick={handleGenerate}
                  disabled={isLoading}
                  data-testid="button-generate"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Рисуем шарж...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Создать шарж!
                    </>
                  )}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleReset}
                  disabled={isLoading}
                  title="Начать заново"
                  data-testid="button-reset"
                >
                  <RefreshCw size={18} />
                </button>
              </div>
            )}

            {/* Loading hint */}
            {isLoading && (
              <div
                className="rounded-2xl p-4 text-center font-semibold text-sm"
                style={{ background: "hsl(var(--accent) / 0.2)", color: "hsl(var(--foreground))" }}
              >
                🎨 Художник работает... обычно это занимает 15–30 секунд
              </div>
            )}
          </div>

          {/* Right column — Result */}
          {resultImage && (
            <div className="animate-bounce-in space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-lg" style={{ color: "hsl(var(--foreground))" }}>
                  🎉 Твой шарж готов!
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
                  >
                    {currentStyle.emoji} {currentStyle.name}
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "hsl(190 95% 45% / 0.12)", color: "hsl(190 95% 35%)" }}
                  >
                    {currentIntensity.emoji} {currentIntensity.label}
                  </span>
                </div>
              </div>
              <img
                src={resultImage}
                alt="Готовый шарж"
                className="result-image w-full"
                data-testid="img-result"
              />
              <div className="flex gap-3">
                <button
                  className="btn-primary flex items-center gap-2 flex-1 justify-center"
                  onClick={handleDownload}
                  data-testid="button-download"
                >
                  <Download size={20} />
                  Скачать PNG
                </button>
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={handleGenerate}
                  disabled={isLoading}
                  title="Ещё раз с тем же стилем"
                  data-testid="button-regenerate"
                >
                  <RefreshCw size={18} />
                  Ещё раз
                </button>
              </div>
              <p className="text-xs font-medium text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
                Попробуй другие стили и уровни шаржирования!
              </p>
            </div>
          )}
        </div>

        {/* Feature badges */}
        {!selectedFile && (
          <div className="flex flex-wrap gap-3 justify-center mt-10">
            {[
              { icon: "⚡", text: "За ~20 секунд" },
              { icon: "🎭", text: "5 стилей шаржа" },
              { icon: "🎚️", text: "5 уровней шаржирования" },
              { icon: "📱", text: "Работает на Android" },
              { icon: "🔒", text: "Фото не сохраняются" },
            ].map((badge) => (
              <div
                key={badge.text}
                className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm"
                style={{ background: "hsl(var(--card))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}
              >
                <span>{badge.icon}</span>
                {badge.text}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
