// Verzie kariet (pole `v`: „Promo“, „Alternate Art“, „Pre-Release“…) je ich vyše sto druhov.
// Na filtre a farbu štítku ich zoskupujeme do pár skupín, ktorým zberateľ rozumie.
export type VariantGroup = "base" | "alt" | "manga" | "promo";

export const VARIANT_GROUPS: { id: VariantGroup; label: string; en: string }[] = [
  { id: "base", label: "Základné", en: "Base" },
  { id: "alt", label: "Alt art a parallel", en: "Alt art & parallel" },
  { id: "manga", label: "Manga", en: "Manga" },
  { id: "promo", label: "Promo a turnaje", en: "Promo & tournaments" },
];

const ALT_RX = /Alternate|Parallel|Full Art|\bSPR?\b|\bTR\b|Foil|Wanted|Box Topper|Heroine Leader|Pandaman|Gold|Signature|\bGem\b|Navy/i;

export function variantGroup(v: string | null | undefined): VariantGroup {
  if (!v || /^(Reprint|Pre-Errata)$/i.test(v) || /· Reprint$/i.test(v)) return "base";
  if (/Manga/i.test(v)) return "manga";
  if (ALT_RX.test(v)) return "alt";
  return "promo";
}
