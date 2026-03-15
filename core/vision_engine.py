import os
import base64
import asyncio
from typing import Dict, Any, Optional
from playwright.async_api import async_playwright
import google.generativeai as genai

class VisionEngine:
    """
    SOTA: Multi-Modal Vision (Visual RAG)
    Research: "Visual-Link: Grounding Code Explanations in UI Pixels"
    Validation: Captures the 'phenotype' (UI) of the organism to perform 
    visual regression analysis and UX diagnostic sanity checks.
    """
    def __init__(self, google_api_key: Optional[str] = None):
        if google_api_key:
            genai.configure(api_key=google_api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    async def capture_ui_snapshot(self, url: str, output_path: str) -> bool:
        """
        Uses Playwright to capture a high-fidelity snapshot of the application.
        """
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch()
                page = await browser.new_page(viewport={'width': 1280, 'height': 720})
                await page.goto(url, wait_until="networkidle")
                # Wait for any animations to settle
                await asyncio.sleep(2) 
                await page.screenshot(path=output_path, full_page=False)
                await browser.close()
                return True
        except Exception as e:
            print(f"👁️ Vision Capture Error: {e}")
            return False
        return False

    async def analyze_visual_health(self, image_path: str, context_query: str) -> Dict[str, Any]:
        """
        Uses Gemini Vision to analyze UX health and structural anomalies.
        """
        try:
            if not os.path.exists(image_path):
                return {"error": "Snapshot not found"}

            with open(image_path, "rb") as f:
                image_data = f.read()
            
            # Formulate the diagnostic prompt
            prompt = f"""
            System: You are 'Helix Vision', a diagnostic multi-modal AI.
            Task: Analyze this UI snapshot of the Helix application.
            Context: {context_query}
            
            Identify:
            1. Visual regressions or layout breaks.
            2. UX bio-feedback: Is the design 'premium', 'high-fidelity', and 'professional'?
            3. Accessibility and readability issues.
            4. Diagnostic score (0-100) for visual health.
            
            Output strictly in JSON format:
            {{
                "score": int,
                "anomalies": [str],
                "aesthetic_rating": str,
                "suggestions": [str]
            }}
            """
            
            response = self.model.generate_content([
                prompt,
                {
                    "mime_type": "image/png",
                    "data": base64.b64encode(image_data).decode('utf-8')
                }
            ])
            
            # Extract JSON from response
            text = response.text
            import json
            # Basic JSON extraction if LLM wraps in markdown
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
                
            return json.loads(text)
        except Exception as e:
            return {"error": str(e)}
