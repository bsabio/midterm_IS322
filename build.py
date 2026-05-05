import json
import os
from jinja2 import Environment, FileSystemLoader

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

    # 2. Set up Jinja2 environment and load template.html
    try:
        # Load templates from the current directory
        env = Environment(loader=FileSystemLoader("."))
        template = env.get_template("template.html")
    except Exception as e:
        print(f"Error loading template: {e}")
        return

    # 3. Render the data into the template
    # We pass the loaded JSON as 'data' since the template uses {{ data.property }}
    rendered_html = template.render(data=data)

    # 4. Save the final result as index.html
    try:
        with open("index.html", "w", encoding="utf-8") as file:
            file.write(rendered_html)
        print("Build successful! index.html has been generated.")
    except Exception as e:
        print(f"Error saving index.html: {e}")

if __name__ == "__main__":
    main()
