use serde::{Deserialize, Serialize};
use crate::settings;

#[derive(Serialize)]
#[allow(dead_code)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct OllamaGenerateResponse {
    response: Option<String>,
}

#[derive(Deserialize)]
struct OllamaModelItem {
    name: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModelItem>>,
}


#[tauri::command]
pub async fn query_ai(
    provider: String,
    endpoint: String,
    model: String,
    api_key: Option<String>,
    prompt: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let key = api_key.unwrap_or_default().trim().to_string();
    let soul = settings::get_soul_file_content().unwrap_or_else(|_| settings::DEFAULT_SOUL_PROMPT.to_string());

    // 1. Google Gemini API (accepts gemini-2.0-flash, gemini-2.0-flash-lite, or custom)
    if provider == "cloud:gemini" {
        if key.is_empty() {
            return Err("Please enter your Gemini API key in Settings (•••)".to_string());
        }
        let gemini_model = if model.trim().is_empty() {
            "gemini-2.5-flash".to_string()
        } else {
            model.trim().to_string()
        };
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            gemini_model, key
        );
        let payload = if soul.trim().is_empty() {
            serde_json::json!({
                "contents": [
                    { "parts": [{ "text": prompt }] }
                ]
            })
        } else {
            serde_json::json!({
                "system_instruction": {
                    "parts": [{ "text": soul }]
                },
                "contents": [
                    { "parts": [{ "text": prompt }] }
                ]
            })
        };
        let resp = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Gemini connection error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_txt = resp.text().await.unwrap_or_default();
            return Err(format!("Gemini API error (HTTP {}): {}", status, err_txt));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(text) = body["candidates"][0]["content"]["parts"][0]["text"].as_str() {
            return Ok(text.to_string());
        }
        return Err("Unexpected response structure from Gemini API".to_string());
    }

    // 2. OpenAI / OpenRouter API
    if provider == "cloud:openai" || provider == "cloud:openrouter" {
        if key.is_empty() {
            return Err("Please enter your API key in Settings (•••)".to_string());
        }
        let m = if model.trim().is_empty() {
            if provider == "cloud:openrouter" { "meta-llama/llama-3.3-70b-instruct" } else { "gpt-4o-mini" }
        } else {
            model.trim()
        };
        let url = if provider == "cloud:openrouter" {
            "https://openrouter.ai/api/v1/chat/completions"
        } else {
            "https://api.openai.com/v1/chat/completions"
        };
        let mut messages = Vec::new();
        if !soul.trim().is_empty() {
            messages.push(serde_json::json!({ "role": "system", "content": soul }));
        }
        messages.push(serde_json::json!({ "role": "user", "content": prompt }));
        let payload = serde_json::json!({
            "model": m,
            "messages": messages
        });
        let resp = client
            .post(url)
            .header("Authorization", format!("Bearer {}", key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("API connection error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_txt = resp.text().await.unwrap_or_default();
            return Err(format!("API error (HTTP {}): {}", status, err_txt));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(text) = body["choices"][0]["message"]["content"].as_str() {
            return Ok(text.to_string());
        }
        return Err("Unexpected response from API".to_string());
    }

    // 3. Anthropic Claude API
    if provider == "cloud:anthropic" {
        if key.is_empty() {
            return Err("Please enter your Anthropic API key in Settings (•••)".to_string());
        }
        let claude_model = if model.trim().is_empty() {
            "claude-3-5-haiku-20241022"
        } else {
            model.trim()
        };
        let mut payload_map = serde_json::Map::new();
        payload_map.insert("model".to_string(), serde_json::json!(claude_model));
        payload_map.insert("max_tokens".to_string(), serde_json::json!(1024));
        if !soul.trim().is_empty() {
            payload_map.insert("system".to_string(), serde_json::json!(soul));
        }
        payload_map.insert("messages".to_string(), serde_json::json!([{ "role": "user", "content": prompt }]));
        let payload = serde_json::Value::Object(payload_map);
        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Claude connection error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_txt = resp.text().await.unwrap_or_default();
            return Err(format!("Claude API error (HTTP {}): {}", status, err_txt));
        }

        let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(text) = body["content"][0]["text"].as_str() {
            return Ok(text.to_string());
        }
        return Err("Unexpected response from Claude API".to_string());
    }

    // 4. Default: Local Ollama / Custom Server
    let base = endpoint.trim_end_matches('/');
    let url = if base.ends_with("/api/generate") {
        base.to_string()
    } else {
        format!("{}/api/generate", base)
    };

    let target_model = if model.trim().is_empty() {
        "llama3.2".to_string()
    } else {
        model.trim().to_string()
    };

    let payload = if soul.trim().is_empty() {
        serde_json::json!({
            "model": target_model,
            "prompt": prompt,
            "stream": false
        })
    } else {
        serde_json::json!({
            "model": target_model,
            "prompt": prompt,
            "system": soul,
            "stream": false
        })
    };

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Ollama is offline at {}. Start Ollama with 'ollama serve' or select Google Gemini in Settings (•••). Error: {}",
                url, e
            )
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama error (HTTP {}): {}", status, err_text));
    }

    let parsed: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(parsed["response"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
pub async fn query_ollama(endpoint: String, model: String, prompt: String) -> Result<String, String> {
    query_ai("ollama:local".to_string(), endpoint, model, None, prompt).await
}

#[tauri::command]
pub async fn list_ollama_models(endpoint: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let base = endpoint.trim_end_matches('/');
    let url = format!("{}/api/tags", base);

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ollama unreachable: {}", e))?;

    let tags: OllamaTagsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse models: {}", e))?;

    let names = tags
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();

    Ok(names)
}

