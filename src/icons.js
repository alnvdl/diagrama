// This file handles icon directives in the text content of a diagram.
// Icons can be included with !!icon-name!! directive.

const iconRegex = /!!([a-z0-9-_]+)!!/i;

export const iconsStylesheet = "./material-symbols/font.css";

// hasIconDirectives checks whether the content has any icon directives.
export function hasIconDirectives(content) {
    return iconRegex.test(content);
}

// withIconElements replaces icon directives with corresponding span elements.
export function withIconElements(content) {
    return content.replace(
        new RegExp(iconRegex.source, 'gi'),
        (_, value) => `<span class="material-symbols-rounded">${value}</span>`);
}
