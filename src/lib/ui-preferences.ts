export const COLOUR_STORAGE_KEY = "daylight.colour";
export const COLOUR_OPTIONS = [
  { id: "violet", label: "Violet", swatch: "#6b50c8" },
  { id: "ocean", label: "Ocean", swatch: "#2563a8" },
  { id: "emerald", label: "Emerald", swatch: "#26734b" },
  { id: "teal", label: "Teal", swatch: "#19767d" },
  { id: "rose", label: "Rose", swatch: "#b43d65" },
  { id: "amber", label: "Amber", swatch: "#946219" },
] as const;
export type ColourPreference = (typeof COLOUR_OPTIONS)[number]["id"];
export function readColour(value: string | null | undefined): ColourPreference {
  return COLOUR_OPTIONS.find((option) => option.id === value)?.id ?? "violet";
}

// Apply only an allowlisted preset before paint, alongside the light/dark choice.
export const COLOUR_INIT_SCRIPT = `(function(){var c='violet';try{var v=localStorage.getItem('${COLOUR_STORAGE_KEY}');if(${JSON.stringify(COLOUR_OPTIONS.map((option) => option.id))}.indexOf(v)!==-1)c=v}catch(e){}document.documentElement.dataset.colour=c})()`;
