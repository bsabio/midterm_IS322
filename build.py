import json
import os
import glob
import markdown
from jinja2 import Environment, FileSystemLoader, select_autoescape

def main():
    # Fail-safe check for AI_API_KEY
    if "AI_API_KEY" in os.environ:
        print("AI refinement active")
    else:
        print("Using raw data.")

    # 1. Load content from data.json
    try:
        with open("content/data.json", "r", encoding="utf-8") as file:
            data = json.load(file)
    except FileNotFoundError:
        print("Error: content/data.json not found.")
        return
    except json.JSONDecodeError:
        print("Error: Invalid JSON format in data.json.")
        return

    # 2. Process Blog Posts
    posts = []
    os.makedirs("posts", exist_ok=True)
    post_files = glob.glob("content/posts/*.md")
    
    # Set up Jinja2 environment
    try:
        env = Environment(
            loader=FileSystemLoader("."),
            autoescape=select_autoescape(['html', 'xml'])
        )
        post_template = env.get_template("post-template.html")
        main_template = env.get_template("template.html")
    except Exception as e:
        print(f"Error loading templates: {e}")
        return

    for filepath in post_files:
        filename = os.path.basename(filepath)
        slug = os.path.splitext(filename)[0]
        
        with open(filepath, "r", encoding="utf-8") as f:
            md_content = f.read()
            
        # Extract title (first h1) or fallback to slug
        title = slug.replace("-", " ").title()
        lines = md_content.split('\n')
        for line in lines:
            if line.startswith('# '):
                title = line[2:].strip()
                break
                
        # Convert Markdown to HTML
        html_content = markdown.markdown(md_content)
        
        # Extract theme (with safe defaults)
        theme = data.get("theme", {})
        bg_color = theme.get("backgroundColor", "#eef1dd")
        accent_color = theme.get("accentColor", "#e87f5a")
        text_size_map = {"small": "14px", "medium": "16px", "large": "20px"}
        font_size = text_size_map.get(theme.get("textSize", "medium"), "16px")

        # Render individual post page
        post_html = post_template.render(
            title=title, content=html_content,
            bg_color=bg_color, accent_color=accent_color, font_size=font_size
        )
        
        # Save post html
        with open(f"posts/{slug}.html", "w", encoding="utf-8") as f:
            f.write(post_html)
            
        posts.append({
            "title": title,
            "slug": slug
        })

    # Extract theme for main template
    theme = data.get("theme", {})
    bg_color = theme.get("backgroundColor", "#eef1dd")
    accent_color = theme.get("accentColor", "#e87f5a")
    text_size_map = {"small": "14px", "medium": "16px", "large": "20px"}
    font_size = text_size_map.get(theme.get("textSize", "medium"), "16px")

    # 3. Render the main index.html
    rendered_html = main_template.render(
        data=data, posts=posts,
        bg_color=bg_color, accent_color=accent_color, font_size=font_size
    )

    # 4. Save the final result as index.html
    try:
        with open("index.html", "w", encoding="utf-8") as file:
            file.write(rendered_html)
        print(f"Build successful! index.html and {len(posts)} posts generated.")
    except Exception as e:
        print(f"Error saving index.html: {e}")

if __name__ == "__main__":
    main()
