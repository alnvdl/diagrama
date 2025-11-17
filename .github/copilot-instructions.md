This project is a minimalistic web-based diagram editor based on the Monaco
Editor and Mermaid.

Never add any new external dependencies or tooling.

DOM reading and writing operations are to be performed only in `src/main.js`.
In other words, do not use functions like `document.querySelector` or
`document.getElementById` in JavaScript files that are note `src/main.js`.
Instead, pass any required DOM elements as function parameters from
`src/main.js`.

Always use double quotes (") when possible in all programming languages.
