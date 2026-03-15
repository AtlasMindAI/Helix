import os


def get_chat_model(*, temperature: float = 0.2, model: str | None = None):
    """
    Returns a chat LLM based on environment configuration.
    Defaults to Google Gemini as the verified 'organism' brain.
    """
    provider = os.getenv("LLM_PROVIDER", "google").strip().lower()

    if provider in {"google", "gemini"}:
        from langchain_google_genai import ChatGoogleGenerativeAI
        resolved_model = model or os.getenv("GEMINI_MODEL") or "gemini-2.5-flash"
        return ChatGoogleGenerativeAI(
            model=resolved_model,
            temperature=temperature,
        )

    # Fallback to OpenAI-compatible if explicitly requested
    if provider in {"openai", "qwen", "openai-compatible"}:
        from langchain_openai import ChatOpenAI
        base_url = os.getenv("OPENAI_BASE_URL", "http://localhost:8000/v1")
        api_key = os.getenv("OPENAI_API_KEY", "EMPTY")
        resolved_model = model or os.getenv("OPENAI_MODEL", "Qwen/Qwen2.5-7B-Instruct")
        return ChatOpenAI(
            model=resolved_model,
            base_url=base_url,
            api_key=api_key,
            temperature=temperature,
        )

    raise ValueError(f"Unsupported LLM_PROVIDER: {provider}")
