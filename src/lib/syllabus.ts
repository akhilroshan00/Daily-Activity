import lessons from "./syllabus-data.json" with { type: "json" };

export type SyllabusLesson = (typeof lessons)[number];

export function searchSyllabus(query: string): SyllabusLesson[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  const day = /^(?:day\s*)?(\d+)$/.exec(text);
  if (day) return lessons.filter((lesson) => lesson.day === Number(day[1]));
  const words = text.split(/\s+/);
  return lessons
    .filter((lesson) => {
      const searchable =
        `${lesson.title} ${lesson.lab} ${lesson.homework}`.toLowerCase();
      return words.every((word) => searchable.includes(word));
    })
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().includes(text)) -
        Number(a.title.toLowerCase().includes(text)),
    )
    .slice(0, 6);
}
