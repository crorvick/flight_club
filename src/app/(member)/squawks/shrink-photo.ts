// Phone cameras produce 3–6 MB photos; for a squawk, 1600px is plenty.
// Shrinking before upload makes the submit quick on a weak signal at the
// field, and re-encoding drops the location the camera embeds.
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function shrinkPhoto(file: File): Promise<File> {
  try {
    // Applies the camera's rotation, so portrait shots stay upright.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d")!;
    // JPEG has no transparency; without this a PNG's clear areas go black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]*$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    // The browser can't decode it.  Send the original; the server
    // explains if it isn't a type or size it accepts.
    return file;
  }
}
