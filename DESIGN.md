# Daylight design specification

The app uses a calm editorial layout: forest navigation, soft ivory canvas, pale sage cards, generous rounded corners and restrained glass surfaces. It emphasizes recorded progress and the next simple action: log a day.

## Tokens

| Token       | Light     | Dark      | Purpose                |
| ----------- | --------- | --------- | ---------------------- |
| `--bg`      | `#f5f7f4` | `#121d18` | App canvas             |
| `--panel`   | `#ffffff` | `#1c2a22` | Cards and dialogs      |
| `--text`    | `#263d32` | `#e4eee4` | Main text              |
| `--muted`   | `#78867c` | `#9aafa0` | Supporting labels      |
| `--border`  | `#e4eae4` | `#33463a` | Dividers and outlines  |
| `--green`   | `#265c46` | `#a5cba7` | Primary actions        |
| `--study`   | `#73a47d` | `#7dab84` | Learning progress      |
| `--misc`    | `#d3ded2` | `#495b4a` | Miscellaneous progress |
| `--holiday` | `#f2d596` | `#bda064` | Holiday indicator      |

Georgia is the display serif. Avenir Next, Segoe UI and Arial are the UI font stack. Fonts are system-owned; no external font request is required. The sidebar is 228 px on wide screens, 205 px on smaller desktop screens, and hidden below 850 px. The calendar always has seven columns and a Monday-first week.

## Composed views

- **Desktop calendar:** Sidebar, workspace header, introductory text, three summary cards, calendar beside monthly balance/recent entries, export bar.
- **Tablet:** Calendar spans the available width, insight cards move beneath it, and calendar/report switches appear above the grid when the sidebar is hidden.
- **Mobile:** Compact seven-column calendar, visible holiday toggles, one balance card, two equal download buttons, full-width daily editor within the viewport.
- **Monthly report:** Same dashboard with an editable daily table replacing the calendar. The table scrolls horizontally on narrow devices.
- **Daily editor:** Date, holiday switch, numeric hours, preset buttons, slider, allocation bar, remarks and save action. Holiday mode replaces the hour form with a rest message.

## Motion and accessibility

- Month/view transitions fade and shift over 150 ms.
- Summary cards appear with a small stagger.
- Desktop dates rise 2 px on hover.
- The native modal's panel opens with a damped spring.
- Learning bars and the monthly ring animate when values change.
- `MotionConfig reducedMotion="user"` and a CSS media rule honor reduced-motion preferences.
- All icon-only controls have accessible labels; switches expose state; the dialog contains focus and restores it on close.

Use these CSS tokens as Figma color variables if creating an editable design. Calendar cells should be a component with pending, logged, holiday, today and adjacent-month variants. Buttons, stat cards and the daily modal can be reused across desktop/mobile frames. The code is the implemented source of truth.
