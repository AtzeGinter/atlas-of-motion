# Fonts

Self-hosted so that visiting the site does not send requests (and visitor IP addresses) to Google. All three families are licensed under the SIL Open Font License 1.1.

| File | Family | Source |
|---|---|---|
| `fraunces-latin.woff2` | Fraunces, variable weight 400-700 and optical size 9-144, Latin subset (headings, numerals) | https://github.com/undercasetype/Fraunces (OFL: `OFL-Fraunces.txt`) |
| `source-serif-4-latin-400.woff2` | Source Serif 4, weight 400, optical size 8-60, Latin subset (reading text) | https://github.com/adobe-fonts/source-serif (OFL: `OFL-SourceSerif4.txt`) |
| `source-serif-4-latin-italic-400.woff2` | Source Serif 4 Italic, weight 400, optical size 8-60, Latin subset | same as above |
| `archivo-latin.woff2` | Archivo, variable weight 400-700, Latin subset (compact controls, tables) | https://github.com/Omnibus-Type/Archivo (OFL: `OFL-Archivo.txt`) |

The woff2 files were downloaded from the Google Fonts CDN (fonts.gstatic.com) for the Google Fonts CSS requests `Archivo:wght@400;500;600;700`, `Fraunces:opsz,wght@9..144,400..700` and `Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400`, taking the `latin` unicode-range subset (U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD).
