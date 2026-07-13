import os
import re
from pathlib import Path

# Configuration
SOURCE_DIR = r"c:\Users\Parent\260713_Sludge_Dryer_Biocon\tex\FR"
TARGET_DIR = r"c:\Users\Parent\260713_Sludge_Dryer_Biocon\src"
IMAGE_PATH_PREFIX = "../images"

def convert_latex_to_html(latex_content):
    """Convert LaTeX content to HTML."""
    
    # Remove comments (lines starting with %)
    lines = latex_content.split('\n')
    lines = [line.split('%')[0] for line in lines]
    content = '\n'.join(lines)
    
    # Remove document class and begin/end document
    content = re.sub(r'\\documentclass\{.*?\}', '', content, flags=re.DOTALL)
    content = re.sub(r'\\usepackage\{.*?\}', '', content, flags=re.DOTALL)
    content = re.sub(r'\\begin\{document\}', '', content)
    content = re.sub(r'\\end\{document\}', '', content)
    
    # Remove various LaTeX formatting commands
    content = re.sub(r'\\vspace\{.*?\}', '', content)
    content = re.sub(r'\\hspace\{.*?\}', '', content)
    content = re.sub(r'\\centering', '', content)
    content = re.sub(r'\\raggedleft', '', content)
    content = re.sub(r'\\raggedright', '', content)
    content = re.sub(r'\\newpage', '', content)
    content = re.sub(r'\\pagebreak', '', content)
    content = re.sub(r'\\\\', '\n', content)  # Line breaks
    
    # Handle figure environments - extract content but remove wrapper
    content = re.sub(r'\\begin\{figure\}\[.*?\](.*?)\\end\{figure\}', r'\1', content, flags=re.DOTALL)
    content = re.sub(r'\\begin\{figure\}(.*?)\\end\{figure\}', r'\1', content, flags=re.DOTALL)
    
    # Remove caption commands
    content = re.sub(r'\\caption\{.*?\}', '', content, flags=re.DOTALL)
    
    # Convert itemize environments
    content = re.sub(r'\\begin\{itemize\}(.*?)\\end\{itemize\}', 
                     lambda m: '<ul>\n' + process_items(m.group(1)) + '</ul>', 
                     content, flags=re.DOTALL)
    
    # Convert enumerate environments
    content = re.sub(r'\\begin\{enumerate\}(.*?)\\end\{enumerate\}', 
                     lambda m: '<ol>\n' + process_items(m.group(1)) + '</ol>', 
                     content, flags=re.DOTALL)
    
    # Convert images
    content = re.sub(r'\\includegraphics\[.*?\]\{Images/(.*?)\}', 
                     lambda m: f'<img src="{IMAGE_PATH_PREFIX}/{m.group(1)}" style="max-width: 100%;">', 
                     content)
    content = re.sub(r'\\includegraphics\{Images/(.*?)\}', 
                     lambda m: f'<img src="{IMAGE_PATH_PREFIX}/{m.group(1)}" style="max-width: 100%;">', 
                     content)
    
    # Convert chapters, sections, and subsections (must be before other text processing)
    content = re.sub(r'\\chapter\{(.*?)\}', r'<h1>\1</h1>', content, flags=re.DOTALL)
    content = re.sub(r'\\section\{(.*?)\}', r'<h2>\1</h2>', content, flags=re.DOTALL)
    content = re.sub(r'\\subsection\{(.*?)\}', r'<h3>\1</h3>', content, flags=re.DOTALL)
    content = re.sub(r'\\subsubsection\{(.*?)\}', r'<h4>\1</h4>', content, flags=re.DOTALL)
    
    # Convert text formatting
    content = re.sub(r'\\textbf\{(.*?)\}', r'<strong>\1</strong>', content, flags=re.DOTALL)
    content = re.sub(r'\\textit\{(.*?)\}', r'<em>\1</em>', content, flags=re.DOTALL)
    content = re.sub(r'\\texttt\{(.*?)\}', r'<code>\1</code>', content, flags=re.DOTALL)
    content = re.sub(r'\\emph\{(.*?)\}', r'<em>\1</em>', content, flags=re.DOTALL)
    
    # Convert special characters
    content = content.replace('--', '–')
    content = content.replace('---', '—')
    content = content.replace(r'\'e', 'é')
    content = content.replace(r'\`e', 'è')
    content = content.replace(r'\^e', 'ê')
    content = content.replace(r'\"e', 'ë')
    content = content.replace(r"\'a", 'á')
    content = content.replace(r'\`a', 'à')
    content = content.replace(r'\^a', 'â')
    content = content.replace(r'\"a', 'ä')
    content = content.replace(r"\'i", 'í')
    content = content.replace(r'\`i', 'ì')
    content = content.replace(r'\^i', 'î')
    content = content.replace(r'\"i', 'ï')
    content = content.replace(r"\'o", 'ó')
    content = content.replace(r'\`o', 'ò')
    content = content.replace(r'\^o', 'ô')
    content = content.replace(r'\"o', 'ö')
    content = content.replace(r"\'u", 'ú')
    content = content.replace(r'\`u', 'ù')
    content = content.replace(r'\^u', 'û')
    content = content.replace(r'\"u', 'ü')
    content = content.replace(r'\c{c}', 'ç')
    content = content.replace(r'~n', 'ñ')
    content = content.replace(r'\o', 'ø')
    content = content.replace(r'\ae', 'æ')
    content = content.replace(r'\aa', 'å')
    
    # Remove any remaining backslash commands
    content = re.sub(r'\\[a-zA-Z]+\{(.*?)\}', r'\1', content, flags=re.DOTALL)
    content = re.sub(r'\\[a-zA-Z]+', '', content)
    
    # Clean up extra spaces and empty lines
    content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)
    content = re.sub(r'[ \t]+', ' ', content)
    
    # Wrap text content in paragraphs
    paragraphs = []
    for line in content.split('\n\n'):
        line = line.strip()
        if line:
            # Don't wrap if it's already HTML
            if not line.startswith('<'):
                line = f'<p>{line}</p>'
            paragraphs.append(line)
    
    content = '\n'.join(paragraphs)
    
    return content

def process_items(items_content):
    """Convert LaTeX items to HTML list items."""
    items = re.findall(r'\\item\s+(.*?)(?=\\item|$)', items_content, flags=re.DOTALL)
    html_items = []
    for item in items:
        item = item.strip()
        if item:
            # Remove remaining backslash commands within items
            item = re.sub(r'\\textbf\{(.*?)\}', r'<strong>\1</strong>', item, flags=re.DOTALL)
            item = re.sub(r'\\textit\{(.*?)\}', r'<em>\1</em>', item, flags=re.DOTALL)
            item = re.sub(r'\\[a-zA-Z]+\{(.*?)\}', r'\1', item, flags=re.DOTALL)
            item = re.sub(r'\\[a-zA-Z]+', '', item)
            item = item.replace('\n', ' ').strip()
            html_items.append(f'  <li>{item}</li>')
    return '\n'.join(html_items) + '\n'

def create_html_document(title, body_content):
    """Create a complete HTML document."""
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }}
        h1 {{
            color: #1a1a1a;
            border-bottom: 2px solid #007bff;
            padding-bottom: 10px;
            margin-top: 30px;
        }}
        h2 {{
            color: #0056b3;
            margin-top: 25px;
        }}
        h3 {{
            color: #003d82;
            margin-top: 20px;
        }}
        h4 {{
            color: #555;
        }}
        img {{
            max-width: 100%;
            height: auto;
            margin: 15px 0;
            border: 1px solid #ddd;
            padding: 5px;
        }}
        ul, ol {{
            margin: 15px 0;
            padding-left: 30px;
        }}
        li {{
            margin: 5px 0;
        }}
        code {{
            background-color: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }}
        strong {{
            font-weight: bold;
        }}
        em {{
            font-style: italic;
        }}
    </style>
</head>
<body>
{body_content}
</body>
</html>
"""
    return html

def convert_tex_files():
    """Main function to convert all .tex files to HTML."""
    
    # Create target directory if it doesn't exist
    Path(TARGET_DIR).mkdir(parents=True, exist_ok=True)
    
    # Get all .tex files
    tex_files = sorted(Path(SOURCE_DIR).glob("*.tex"))
    
    if not tex_files:
        print(f"No .tex files found in {SOURCE_DIR}")
        return
    
    print(f"Found {len(tex_files)} .tex files to convert")
    
    for tex_file in tex_files:
        print(f"Converting: {tex_file.name}")
        
        # Read LaTeX file
        with open(tex_file, 'r', encoding='utf-8') as f:
            latex_content = f.read()
        
        # Convert to HTML
        html_body = convert_latex_to_html(latex_content)
        
        # Create full HTML document
        title = tex_file.stem
        html_document = create_html_document(title, html_body)
        
        # Save as HTML
        html_file = Path(TARGET_DIR) / f"{tex_file.stem}.html"
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(html_document)
        
        print(f"  → Saved: {html_file.name}")
    
    print(f"\nConversion complete! {len(tex_files)} files converted to {TARGET_DIR}")

if __name__ == "__main__":
    convert_tex_files()
