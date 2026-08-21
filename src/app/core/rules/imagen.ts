/**
 * Una imagen elegida por el usuario, achicada a un cuadrado y devuelta como
 * data URL.
 *
 * Tanto el retrato del personaje como el avatar del perfil viajan dentro de un
 * jsonb, así que una foto de cámara entera no entra: hay que recortarla y
 * recomprimirla antes de guardarla.
 */
export async function recorteCuadrado(file: File, lado = 256): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d')!;
  // Recorte cuadrado centrado: se muestra un retrato, no la foto entera.
  const corte = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);

  return canvas.toDataURL('image/jpeg', 0.8);
}

/** Las iniciales que se muestran cuando no hay avatar cargado. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/[\s._-]+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}
