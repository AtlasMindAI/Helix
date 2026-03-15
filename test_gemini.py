import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"

try:
    response = requests.get(url)
    models = response.json()
    for m in models.get("models", []):
        if "generateContent" in m.get("supportedGenerationMethods", []):
            print(m["name"])
except Exception as e:
    print("Failed to get models:", str(e))
