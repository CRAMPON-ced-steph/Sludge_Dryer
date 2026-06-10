const fs = require('fs');
const path = require('path');

const SOURCE_DIR = 'c:\\Users\\Parent\\260607_Hazardous\\HW_courses\\FR';
const TARGET_DIR = 'c:\\Users\\Parent\\260607_Hazardous\\src';

function getImageDir(filename) {
    // Extract module number from filename (M1, M2, M10, etc.)
    const match = filename.match(/M(\d+)/);
    if (match) {
        return `M${match[1]}`;
    }
    return 'Generic';
}

function convertLatexToHtml(latexContent, filename) {
    let content = latexContent;

    // Remove comments
    content = content.split('\n').map(line => line.split('%')[0]).join('\n');

    // Remove LaTeX document structure
    content = content.replace(/\\documentclass\{.*?\}/gs, '');
    content = content.replace(/\\usepackage\{.*?\}/gs, '');
    content = content.replace(/\\begin\{document\}/g, '');
    content = content.replace(/\\end\{document\}/g, '');

    // Remove spacing commands
    content = content.replace(/\\vspace\{.*?\}/g, '');
    content = content.replace(/\\hspace\{.*?\}/g, '');
    content = content.replace(/\\centering/g, '');
    content = content.replace(/\\raggedleft/g, '');
    content = content.replace(/\\raggedright/g, '');
    content = content.replace(/\\newpage/g, '');
    content = content.replace(/\\pagebreak/g, '');
    content = content.replace(/\\\\/g, '\n');

    // Remove figure environment wrappers but keep content
    content = content.replace(/\\begin\{figure\}\[.*?\](.*?)\\end\{figure\}/gs, '$1');
    content = content.replace(/\\begin\{figure\}(.*?)\\end\{figure\}/gs, '$1');

    // Remove caption
    content = content.replace(/\\caption\{.*?\}/gs, '');

    // Extract module number for image paths
    const imageDir = getImageDir(filename);

    // Convert images - handle both with and without width specifications
    content = content.replace(/\\includegraphics\[.*?\]\{Images\/(.*?)\}/g, 
        (match, imgPath) => `<img src="../images/${imgPath}" alt="Image" style="max-width: 100%; height: auto; margin: 15px 0; border: 1px solid #ddd; padding: 5px;">`);
    content = content.replace(/\\includegraphics\{Images\/(.*?)\}/g, 
        (match, imgPath) => `<img src="../images/${imgPath}" alt="Image" style="max-width: 100%; height: auto; margin: 15px 0; border: 1px solid #ddd; padding: 5px;">`);

    // Convert itemize environments
    content = content.replace(/\\begin\{itemize\}(.*?)\\end\{itemize\}/gs, (match, items) => {
        const liItems = items.match(/\\item\s+(.*?)(?=\\item|$)/gs) || [];
        const html = '<ul>\n' + liItems.map(item => {
            item = item.replace(/\\item\s+/, '').trim();
            item = item.replace(/\\textbf\{(.*?)\}/g, '<strong>$1</strong>');
            item = item.replace(/\\textit\{(.*?)\}/g, '<em>$1</em>');
            item = item.replace(/\\[a-zA-Z]+\{(.*?)\}/g, '$1');
            item = item.replace(/\\[a-zA-Z]+/g, '');
            item = item.replace(/\n/g, ' ').trim();
            return `  <li>${item}</li>`;
        }).join('\n') + '\n</ul>';
        return html;
    });

    // Convert enumerate environments
    content = content.replace(/\\begin\{enumerate\}(.*?)\\end\{enumerate\}/gs, (match, items) => {
        const liItems = items.match(/\\item\s+(.*?)(?=\\item|$)/gs) || [];
        const html = '<ol>\n' + liItems.map(item => {
            item = item.replace(/\\item\s+/, '').trim();
            item = item.replace(/\\textbf\{(.*?)\}/g, '<strong>$1</strong>');
            item = item.replace(/\\textit\{(.*?)\}/g, '<em>$1</em>');
            item = item.replace(/\\[a-zA-Z]+\{(.*?)\}/g, '$1');
            item = item.replace(/\\[a-zA-Z]+/g, '');
            item = item.replace(/\n/g, ' ').trim();
            return `  <li>${item}</li>`;
        }).join('\n') + '\n</ol>';
        return html;
    });

    // Convert chapters, sections, subsections
    content = content.replace(/\\chapter\{(.*?)\}/gs, '<h1>$1</h1>');
    content = content.replace(/\\section\{(.*?)\}/gs, '<h2>$1</h2>');
    content = content.replace(/\\subsection\{(.*?)\}/gs, '<h3>$1</h3>');
    content = content.replace(/\\subsubsection\{(.*?)\}/gs, '<h4>$1</h4>');

    // Convert text formatting
    content = content.replace(/\\textbf\{(.*?)\}/gs, '<strong>$1</strong>');
    content = content.replace(/\\textit\{(.*?)\}/gs, '<em>$1</em>');
    content = content.replace(/\\texttt\{(.*?)\}/gs, '<code>$1</code>');
    content = content.replace(/\\emph\{(.*?)\}/gs, '<em>$1</em>');

    // Convert special characters
    content = content.replace(/--/g, '–');
    content = content.replace(/---/g, '—');
    content = content.replace(/\\'e/g, 'é');
    content = content.replace(/\\`e/g, 'è');
    content = content.replace(/\\^e/g, 'ê');
    content = content.replace(/\\"e/g, 'ë');
    content = content.replace(/\\'a/g, 'á');
    content = content.replace(/\\`a/g, 'à');
    content = content.replace(/\\^a/g, 'â');
    content = content.replace(/\\"a/g, 'ä');
    content = content.replace(/\\'i/g, 'í');
    content = content.replace(/\\`i/g, 'ì');
    content = content.replace(/\\^i/g, 'î');
    content = content.replace(/\\"i/g, 'ï');
    content = content.replace(/\\'o/g, 'ó');
    content = content.replace(/\\`o/g, 'ò');
    content = content.replace(/\\^o/g, 'ô');
    content = content.replace(/\\"o/g, 'ö');
    content = content.replace(/\\'u/g, 'ú');
    content = content.replace(/\\`u/g, 'ù');
    content = content.replace(/\\^u/g, 'û');
    content = content.replace(/\\"u/g, 'ü');
    content = content.replace(/\\c\{c\}/g, 'ç');
    content = content.replace(/~n/g, 'ñ');
    content = content.replace(/\\o\b/g, 'ø');
    content = content.replace(/\\ae/g, 'æ');
    content = content.replace(/\\aa/g, 'å');

    // Remove remaining LaTeX commands
    content = content.replace(/\\[a-zA-Z]+\{(.*?)\}/gs, '$1');
    content = content.replace(/\\[a-zA-Z]+/g, '');

    // Handle minipage environments
    content = content.replace(/\\begin\{minipage\}\{.*?\}(.*?)\\end\{minipage\}/gs, '$1');

    // Clean up extra whitespace
    content = content.replace(/\n\s*\n\s*\n+/g, '\n\n');
    content = content.replace(/[ \t]+/g, ' ');

    // Wrap paragraphs
    const paragraphs = [];
    const blocks = content.split('\n\n');
    
    for (const block of blocks) {
        const trimmed = block.trim();
        if (trimmed) {
            if (trimmed.startsWith('<')) {
                paragraphs.push(trimmed);
            } else {
                paragraphs.push(`<p>${trimmed}</p>`);
            }
        }
    }

    return paragraphs.join('\n\n');
}

function createHtmlDocument(title, bodyContent) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.8;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            color: #333;
            background-color: #f9f9f9;
        }
        
        h1 {
            color: #1a1a1a;
            border-bottom: 3px solid #007bff;
            padding-bottom: 15px;
            margin: 40px 0 30px 0;
            font-size: 2.2em;
        }
        
        h2 {
            color: #0056b3;
            margin: 35px 0 20px 0;
            font-size: 1.7em;
            border-left: 4px solid #0056b3;
            padding-left: 15px;
        }
        
        h3 {
            color: #003d82;
            margin: 25px 0 15px 0;
            font-size: 1.3em;
            border-left: 3px solid #003d82;
            padding-left: 12px;
        }
        
        h4 {
            color: #555;
            margin: 20px 0 10px 0;
            font-size: 1.1em;
        }
        
        p {
            margin: 15px 0;
            text-align: justify;
        }
        
        img {
            max-width: 100%;
            height: auto;
            margin: 25px 0;
            border: 1px solid #ddd;
            padding: 8px;
            background-color: #fff;
            border-radius: 4px;
            display: block;
            margin-left: auto;
            margin-right: auto;
        }
        
        ul, ol {
            margin: 20px 0 20px 30px;
            padding-left: 20px;
        }
        
        li {
            margin: 10px 0;
            text-align: justify;
        }
        
        strong {
            font-weight: 600;
            color: #1a1a1a;
        }
        
        em {
            font-style: italic;
        }
        
        code {
            background-color: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.95em;
        }
    </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function convertAllTexFiles() {
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.tex')).sort();
    
    console.log(`Found ${files.length} .tex files to convert\n`);

    files.forEach(file => {
        const sourceFile = path.join(SOURCE_DIR, file);
        const targetFile = path.join(TARGET_DIR, file.replace('.tex', '.html'));
        
        try {
            console.log(`Converting: ${file}`);
            const latexContent = fs.readFileSync(sourceFile, 'utf-8');
            const htmlBody = convertLatexToHtml(latexContent, file);
            const title = file.replace('.tex', '');
            const htmlDocument = createHtmlDocument(title, htmlBody);
            
            fs.writeFileSync(targetFile, htmlDocument, 'utf-8');
            console.log(`  ✓ Saved: ${path.basename(targetFile)}\n`);
        } catch (error) {
            console.error(`  ✗ Error converting ${file}: ${error.message}\n`);
        }
    });

    console.log(`Conversion complete! ${files.length} files converted.`);
}

convertAllTexFiles();
