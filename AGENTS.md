# Numeric Project

## Business Requirements

- An MVP of a prediction model style for nuevos tiempos reventados application as a web app  
- The web app should must the prediction in a tabla like apears in the file prediction.csv.
- the table must contain the predicction from jueves 19 de febrero hasta martes 31 de marzo del 2026
- uses the llm must aceptable o creo new one, for this prediction.
- the new prediction must follow the psecuence from the dates.
- Add a new card to a column; delete an existing card
- No more functionality: no archive, no search/filter. Keep it simple.
- The priority is a slick, professional, gorgeous UI/UX with very simple features
- The app should open with dummy data populated for the single board

- Build an MVP web application for a prediction model called “Nuevos Tiempos Reventados.”
- The application must display predictions in a table format, matching the structure shown in prediction.csv.
- The table must include prediction data for the period:
    From: Thursday, February 19, 2026
    To: Tuesday, March 31, 2026
- The prediction model must:
    - Use an existing LLM or create a new prediction logic powered by an LLM.
    - Generate predictions that follow a continuous chronological sequence based on dates.
    - Automatically populate predictions for all required dates.


## Scope Constraints (Keep MVP Simple)
- No authentication
- the tile is : prediction.csv
- the web pagis is:https://www.jps.go.cr/resultados/nuevos-tiempos-reventados
- Single-page application only

## UI / UX Requirements

- Priority: slick, modern, professional, visually appealing UI
- Clean dashboard-style layout
- The application must open with:
    - Preloaded prediction data
    - A single prediction board/table visible immediately

## Technical Details

- Implemented as a modern NextJS app, client rendered
- The NextJS app should be created in a subdirectory `frontend`
- No persistence
- No user management for the MVP
- Use popular libraries
- As simple as possible but with an elegant UI

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Strategy

1. Write plan with success criteria for each phase to be checked off. Include project scaffolding, including .gitignore, and rigorous unit testing.
2. Execute the plan ensuring all critiera are met
3. Carry out extensive integration testing with Playwright or similar, fixing defects
4. Only complete when the MVP is finished and tested, with the server running and ready for the user

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever

