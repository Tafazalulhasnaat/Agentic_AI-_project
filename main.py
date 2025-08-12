from fastapi import FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
from typing import TypedDict
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
EXCHANGE_API_KEY = os.getenv("EXCHANGE_API_KEY")





@tool
def weather_tool(city: str) -> str:
    """Get live weather info for a city, fixing typos via geocoding."""
    try:
        # Step 1: Geocode city (handles misspellings)
        geo_url = f"https://api.openweathermap.org/geo/1.0/direct?q={city}&limit=1&appid={OPENWEATHER_API_KEY}"
        geo_res = requests.get(geo_url)
        geo_data = geo_res.json()

        if not geo_data:
            return f"⚠️ Sorry, I couldn't find weather for '{city}'."

        lat, lon = geo_data[0]['lat'], geo_data[0]['lon']
        proper_name = geo_data[0]['name']

        # Step 2: Get weather using coordinates
        weather_url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
        weather_res = requests.get(weather_url)
        data = weather_res.json()

        temp = data['main']['temp']
        desc = data['weather'][0]['description']
        humidity = data['main']['humidity']
        wind = data['wind']['speed']

        return (f"🌤️ Weather in {proper_name}:\n"
                f"🌡️ Temp: {temp}°C\n"
                f"💧 Humidity: {humidity}%\n"
                f"🌬️ Wind: {wind} m/s\n"
                f"📋 Condition: {desc.capitalize()}")

    except Exception as e:
        return f"❌ Error fetching weather: {e}"


@tool
def exchange_rate_tool(from_currency: str, to_currency: str, amount: float = 1) -> str:
    """Convert an amount from one currency to another using real exchange rates."""
    url = f"https://v6.exchangerate-api.com/v6/{EXCHANGE_API_KEY}/pair/{from_currency}/{to_currency}/{amount}"
    try:
        response = requests.get(url)
        data = response.json()

        if response.status_code == 200 and data["result"] == "success":
            converted_amount = data["conversion_result"]
            rate = data["conversion_rate"]
            return f"💱 {amount} {from_currency.upper()} = {converted_amount:.2f} {to_currency.upper()} (Rate: {rate})"
        else:
            return f"⚠️ Exchange error: {data.get('error-type', 'Unknown issue')}"
    except Exception as e:
        return f"❌ Error: {str(e)}"

@tool
def general_question_tool(question: str) -> str:
    """Answer general knowledge questions using Gemini."""
    try:
        gemini = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            temperature=0.3,
            google_api_key=GOOGLE_API_KEY
        )
        resp = gemini.invoke(question)
        return resp.content
    except Exception as e:
        return f"❌ Error answering question: {e}"

# Register tools
tools = [weather_tool, exchange_rate_tool, general_question_tool]

# ===== MODEL =====
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0,
    google_api_key=GOOGLE_API_KEY
).bind_tools(tools)

# ===== STATE =====
class AgentState(TypedDict):
    question: str
    answer: str

# ===== AGENT NODE =====
def agent_node(state: AgentState) -> AgentState:
    user_question = state["question"]

    # 🚀 Smart wrapper prompt to guide Gemini
    refined_prompt = (
    f"You are a smart, task-routing AI. When the user asks about weather—no matter how casually or informally phrased—identify and correct any misspelled city names using best-guess logic. "
    f"Resolve slang like 'rn' to 'right now' and extract both weather metrics (e.g. humidity, temperature, rain) and location names. "
    f"If multiple cities or metrics are mentioned, handle each one separately and call weather_tool with the corrected city name. "
    f"Respond only with the tool call result(s), in a clean and informative format. "
    f"\n\nUser asked: '{user_question}'"
)


    response = model.invoke(refined_prompt)

    # Handle tool call from Gemini
    if hasattr(response, "tool_calls") and response.tool_calls:
        tool_call = response.tool_calls[0]
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]

        for t in tools:
            if t.name == tool_name:
                tool_result = t.invoke(tool_args)
                return {"question": user_question, "answer": tool_result}

    # Fallback general question
    return {
        "question": user_question,
        "answer": general_question_tool.invoke({"question": user_question})
    }


# ===== GRAPH =====
graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_edge(START, "agent")
graph.add_edge("agent", END)
app_graph = graph.compile()


app = FastAPI(title="AI Agent API", version="1.0")

# Allow frontend calls (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to your frontend URL for security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Updated to accept `text` from Form data
from fastapi import Form

@app.post("/ask")
def ask_agent(text: str = Form(...)):
    """Ask the AI Agent a question and get an answer."""
    result = app_graph.invoke({"question": text})
    answer = result["answer"]

    
    history = [
        {"role": "user", "content": text},
        {"role": "ai", "content": answer}
    ]

    return {"history": history}

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Serve static folder
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# Serve index.html at root
@app.get("/")
def read_root():
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
