use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WebResultItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct YouTubeVideoItem {
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration: String,
    pub thumbnail: String,
}

#[cfg(target_os = "windows")]
extern "system" {
    fn ShellExecuteW(
        hwnd: *mut std::ffi::c_void,
        lpOperation: *const u16,
        lpFile: *const u16,
        lpParameters: *const u16,
        lpDirectory: *const u16,
        nShowCmd: i32,
    ) -> isize;
}

#[tauri::command]
pub fn open_browser_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide_op: Vec<u16> = std::ffi::OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();
        let wide_url: Vec<u16> = std::ffi::OsStr::new(&url).encode_wide().chain(std::iter::once(0)).collect();
        unsafe {
            let res = ShellExecuteW(
                std::ptr::null_mut(),
                wide_op.as_ptr(),
                wide_url.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1, // SW_SHOWNORMAL
            );
            if res <= 32 {
                // Fallback to cmd start if needed
                let _ = std::process::Command::new("cmd")
                    .args(["/c", "start", "", &url])
                    .spawn();
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }

    Ok(())
}

pub fn decode_bing_u(raw_url: &str) -> String {
    let clean = raw_url.replace("&amp;", "&");
    let target = if let Some(pos) = clean.find("&u=") {
        Some(&clean[pos + 3..])
    } else if let Some(pos) = clean.find("?u=") {
        Some(&clean[pos + 3..])
    } else {
        None
    };

    if let Some(after) = target {
        let end = after.find('&').unwrap_or(after.len());
        let mut b64_token = &after[..end];
        if b64_token.starts_with("a1") || b64_token.starts_with("a0") {
            b64_token = &b64_token[2..];
        }
        if let Some(decoded) = decode_base64_str(b64_token) {
            if decoded.starts_with("http://") || decoded.starts_with("https://") {
                return decoded;
            }
        }
    }
    raw_url.to_string()
}

pub fn decode_base64_str(input: &str) -> Option<String> {
    const B64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut bytes = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for b in input.bytes() {
        if b == b'=' { break; }
        let val = if b == b'-' {
            62
        } else if b == b'_' {
            63
        } else if let Some(pos) = B64_CHARS.iter().position(|&c| c == b) {
            pos as u32
        } else {
            continue;
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            bytes.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    String::from_utf8(bytes).ok()
}

/// Strip commercial tracking and session parameters from search URLs
pub fn clean_tracking_url(url: &str) -> String {
    if let Some(q_idx) = url.find('?') {
        let base = &url[..q_idx];
        let query_str = &url[q_idx + 1..];
        let filtered_params: Vec<&str> = query_str
            .split('&')
            .filter(|p| {
                let lower = p.to_lowercase();
                !lower.starts_with("msockid=")
                    && !lower.starts_with("utm_")
                    && !lower.starts_with("fbclid=")
                    && !lower.starts_with("gclid=")
                    && !lower.starts_with("ref=")
                    && !lower.starts_with("tag=")
                    && !lower.starts_with("affiliate=")
                    && !lower.starts_with("sprefix=")
                    && !lower.starts_with("crid=")
            })
            .collect();
        if filtered_params.is_empty() {
            base.to_string()
        } else {
            format!("{}?{}", base, filtered_params.join("&"))
        }
    } else {
        url.to_string()
    }
}

/// Identify unwanted spam, personal social media profiles, and ad networks
pub fn is_unwanted_or_spam(url: &str, title: &str, query: &str) -> bool {
    let url_lower = url.to_lowercase();
    let title_lower = title.to_lowercase();
    let q_lower = query.to_lowercase();

    // 1. Filter out personal social media profiles (unless query specifically searches for them)
    let is_personal_profile = url_lower.contains("linkedin.com/in/")
        || url_lower.contains("linkedin.com/pub/")
        || (url_lower.contains("facebook.com/") && (url_lower.contains("/people/") || url_lower.contains("/profile.php")))
        || (url_lower.contains("instagram.com/") && !url_lower.contains("/explore/"))
        || url_lower.contains("tiktok.com/@")
        || url_lower.contains("pinterest.com/pin/");

    if is_personal_profile {
        let asked_social = q_lower.contains("linkedin")
            || q_lower.contains("profile")
            || q_lower.contains("who is")
            || q_lower.contains("facebook")
            || q_lower.contains("instagram")
            || q_lower.contains("tiktok");
        if !asked_social {
            return true;
        }
    }

    // 2. Filter ad networks, tracking redirects, and coupon/affiliate spam
    if url_lower.contains("bing.com/ck")
        || url_lower.contains("google.com/url")
        || url_lower.contains("doubleclick.net")
        || url_lower.contains("adnxs.com")
        || url_lower.contains("outbrain.com")
        || url_lower.contains("taboola.com")
        || url_lower.contains("coupons.")
        || url_lower.contains("retailmenot.")
        || url_lower.contains("picclick.")
        || url_lower.contains("dealnews.")
        || url_lower.contains("trustpilot.com/review")
    {
        return true;
    }

    // 3. Filter generic ecommerce sales spam when user didn't ask to shop
    if (title_lower.contains("for sale online")
        || title_lower.contains("buy online at low prices")
        || title_lower.contains("best deals on")
        || title_lower.contains("cheap prices on"))
        && !q_lower.contains("buy")
        && !q_lower.contains("shop")
        && !q_lower.contains("price")
        && !q_lower.contains("deal")
        && !q_lower.contains("cheap")
    {
        return true;
    }

    false
}

/// Calculate relevance & authority score for candidate search items
pub fn score_search_item(url: &str, title: &str, query: &str) -> i32 {
    let url_lower = url.to_lowercase();
    let title_lower = title.to_lowercase();
    let q_lower = query.to_lowercase();
    let mut score = 0;

    let q_words: Vec<&str> = q_lower
        .split_whitespace()
        .filter(|w| w.len() >= 2)
        .collect();

    // Authority domain bonuses
    if url_lower.contains("wikipedia.org") {
        score += 65;
    } else if url_lower.contains("github.com") {
        score += 60;
    } else if url_lower.contains("stackoverflow.com") {
        score += 55;
    } else if url_lower.contains(".gov") || url_lower.contains(".edu") {
        score += 55;
    } else if url_lower.contains(".org") {
        score += 35;
    } else if url_lower.contains("apple.com")
        || url_lower.contains("microsoft.com")
        || url_lower.contains("google.com")
        || url_lower.contains("mozilla.org")
        || url_lower.contains("youtube.com")
        || url_lower.contains("reddit.com")
    {
        score += 45;
    }

    // Domain match bonus (e.g. query "python" -> domain "python.org")
    if let Some(domain_start) = url_lower.find("://") {
        let domain_part = &url_lower[domain_start + 3..];
        let domain = domain_part.split('/').next().unwrap_or(domain_part);
        for w in &q_words {
            if domain.contains(w) {
                score += 50;
            }
        }
    }

    // Title word match bonuses
    let mut matched_words = 0;
    for w in &q_words {
        if title_lower.contains(w) {
            score += 25;
            matched_words += 1;
        }
    }

    // Exact title match bonus
    if title_lower.starts_with(&q_lower) {
        score += 35;
    }

    // Heavy penalty if query has multiple words but title matched none
    if q_words.len() >= 2 && matched_words == 0 && !url_lower.contains("wikipedia.org") {
        score -= 40;
    }

    score
}

/// Instant direct navigation check (Raycast / Spotlight style)
pub fn check_direct_navigation(query: &str) -> Option<WebResultItem> {
    let q = query.trim().to_lowercase();
    let (name, url, desc) = match q.as_str() {
        "google" => ("Google", "https://www.google.com", "Search the world's information."),
        "youtube" | "yt" => ("YouTube", "https://www.youtube.com", "Watch, upload and share videos."),
        "github" | "gh" => ("GitHub", "https://github.com", "Where the world builds software."),
        "wikipedia" | "wiki" => ("Wikipedia", "https://www.wikipedia.org", "The Free Encyclopedia."),
        "reddit" => ("Reddit", "https://www.reddit.com", "Dive into anything."),
        "chatgpt" | "openai" => ("ChatGPT", "https://chatgpt.com", "AI conversational model by OpenAI."),
        "apple" => ("Apple", "https://www.apple.com", "Official Apple home page, products, and support."),
        "amazon" => ("Amazon", "https://www.amazon.com", "Online shopping for electronics, apparel, and more."),
        "netflix" => ("Netflix", "https://www.netflix.com", "Stream TV shows and movies."),
        "spotify" => ("Spotify", "https://open.spotify.com", "Music and podcasts for everyone."),
        "twitter" | "x" => ("X (formerly Twitter)", "https://x.com", "See what’s happening in the world right now."),
        "stackoverflow" => ("Stack Overflow", "https://stackoverflow.com", "Where developers learn, share, and build careers."),
        "twitch" => ("Twitch", "https://www.twitch.tv", "Live streaming platform for gaming and entertainment."),
        "discord" => ("Discord", "https://discord.com", "Talk, chat, hang out, and stay close with friends."),
        _ => {
            // Direct domain input like "github.com" or "example.org"
            let tlds = [".com", ".org", ".net", ".io", ".dev", ".ai", ".it", ".de", ".fr", ".co.uk", ".app"];
            let has_tld = tlds.iter().any(|tld| q.ends_with(tld) || q.contains(&format!("{}/", tld)));
            if has_tld && !q.contains(' ') {
                let direct_url = if q.starts_with("http://") || q.starts_with("https://") {
                    q.to_string()
                } else {
                    format!("https://{}", q)
                };
                return Some(WebResultItem {
                    title: format!("Visit {}", q),
                    url: direct_url,
                    snippet: format!("Direct navigation to {}", q),
                });
            }
            return None;
        }
    };

    Some(WebResultItem {
        title: format!("{} — Official Site", name),
        url: url.to_string(),
        snippet: desc.to_string(),
    })
}

#[tauri::command]
pub async fn search_web_results(query: String) -> Result<Vec<WebResultItem>, String> {
    let q_trimmed = query.trim();
    if q_trimmed.len() < 2 {
        return Ok(Vec::new());
    }

    let mut candidates: Vec<(i32, WebResultItem)> = Vec::new();

    // 1. Direct navigation check (Spotlight / Raycast style)
    if let Some(direct) = check_direct_navigation(q_trimmed) {
        candidates.push((200, direct));
    }

    let encoded = urlencode(q_trimmed);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    // 2. Fetch Wikipedia OpenSearch API (guarantees safe, encyclopedic knowledge)
    let wiki_url = format!(
        "https://en.wikipedia.org/w/api.php?action=opensearch&search={}&limit=3&namespace=0&format=json",
        encoded
    );
    if let Ok(resp) = client
        .get(&wiki_url)
        .header("User-Agent", "DynamicIslandCopilot/1.0 (desktop app)")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(arr) = resp.json::<serde_json::Value>().await {
                if let (Some(titles), Some(snippets), Some(urls)) = (
                    arr.get(1).and_then(|v| v.as_array()),
                    arr.get(2).and_then(|v| v.as_array()),
                    arr.get(3).and_then(|v| v.as_array()),
                ) {
                    for i in 0..titles.len() {
                        let t = titles.get(i).and_then(|v| v.as_str()).unwrap_or("");
                        let s = snippets.get(i).and_then(|v| v.as_str()).unwrap_or("");
                        let u = urls.get(i).and_then(|v| v.as_str()).unwrap_or("");
                        if !t.is_empty() && !u.is_empty() {
                            let item = WebResultItem {
                                title: format!("{} — Wikipedia", t),
                                url: u.to_string(),
                                snippet: if s.is_empty() { format!("Read about {} on Wikipedia.", t) } else { s.to_string() },
                            };
                            let score = score_search_item(&item.url, &item.title, q_trimmed);
                            candidates.push((score, item));
                        }
                    }
                }
            }
        }
    }

    // 3. Fetch live web results and clean/filter them
    let search_url = format!("https://www.bing.com/search?q={}", encoded);
    if let Ok(resp) = client
        .get(&search_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(html) = resp.text().await {
                for block in html.split("<li class=\"b_algo\"").skip(1) {
                    if candidates.len() >= 12 {
                        break;
                    }
                    if let Some(h2_start) = block.find("<h2>") {
                        if let Some(h2_end) = block[h2_start..].find("</h2>") {
                            let h2_html = &block[h2_start..h2_start + h2_end];
                            let title = strip_html_tags(h2_html);
                            let raw_href = extract_href(h2_html);
                            let decoded_url = decode_bing_u(&raw_href);
                            let final_url = clean_tracking_url(&decoded_url);

                            let mut snippet = String::new();
                            if let Some(cap_start) = block.find("class=\"b_caption\"") {
                                if let Some(p_start) = block[cap_start..].find("<p") {
                                    let p_slice = &block[cap_start + p_start..];
                                    if let Some(p_tag_end) = p_slice.find('>') {
                                        let text_start = p_tag_end + 1;
                                        if let Some(p_close) = p_slice[text_start..].find("</p>") {
                                            snippet = strip_html_tags(&p_slice[text_start..text_start + p_close]);
                                        }
                                    }
                                }
                            }

                            if !title.is_empty()
                                && !final_url.is_empty()
                                && final_url.starts_with("http")
                                && !is_unwanted_or_spam(&final_url, &title, q_trimmed)
                            {
                                let item = WebResultItem {
                                    title,
                                    url: final_url,
                                    snippet: if snippet.is_empty() {
                                        format!("Direct link for \"{}\"", q_trimmed)
                                    } else {
                                        snippet
                                    },
                                };
                                let score = score_search_item(&item.url, &item.title, q_trimmed);
                                if score >= 10 {
                                    candidates.push((score, item));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort candidates by score descending
    candidates.sort_by(|a, b| b.0.cmp(&a.0));

    // Deduplicate by canonical URL
    let mut final_items = Vec::new();
    for (_, item) in candidates {
        if !final_items.iter().any(|existing: &WebResultItem| existing.url == item.url) {
            final_items.push(item);
        }
        if final_items.len() >= 4 {
            break;
        }
    }

    // If still empty, provide clean safe search fallbacks
    if final_items.is_empty() {
        final_items.push(WebResultItem {
            title: format!("Search \"{}\" on Google", q_trimmed),
            url: format!("https://www.google.com/search?q={}", encoded),
            snippet: format!("Explore verified web articles and guides for \"{}\" in your browser.", q_trimmed),
        });
        final_items.push(WebResultItem {
            title: format!("Search \"{}\" on DuckDuckGo", q_trimmed),
            url: format!("https://duckduckgo.com/?q={}", encoded),
            snippet: format!("Search for \"{}\" with zero ads and complete privacy.", q_trimmed),
        });
    }

    Ok(final_items)
}

#[tauri::command]
pub async fn instant_web_search(query: String) -> Result<String, String> {
    let results = search_web_results(query).await?;
    if let Some(first) = results.first() {
        return Ok(format!("{}: {}", first.title, first.snippet));
    }
    Ok(String::new())
}

pub fn extract_json_string_after(s: &str, prefix: &str) -> Option<String> {
    let start_idx = s.find(prefix)? + prefix.len();
    let rest = s[start_idx..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let bytes = rest.as_bytes();
    let mut i = 1;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i += 2;
            continue;
        }
        if bytes[i] == b'"' {
            let json_literal = &rest[..=i];
            if let Ok(decoded) = serde_json::from_str::<String>(json_literal) {
                return Some(decoded);
            }
            return Some(rest[1..i].to_string());
        }
        i += 1;
    }
    None
}

#[tauri::command]
pub async fn search_youtube_videos(query: String) -> Result<Vec<YouTubeVideoItem>, String> {
    let q_trimmed = query.trim();
    if q_trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let encoded = urlencode(q_trimmed);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    let yt_url = format!("https://www.youtube.com/results?search_query={}", encoded);
    let mut videos: Vec<YouTubeVideoItem> = Vec::new();

    if let Ok(resp) = client
        .get(&yt_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(html) = resp.text().await {
                for block in html.split("\"videoRenderer\":{\"videoId\":\"").skip(1) {
                    if videos.len() >= 8 {
                        break;
                    }
                    let id_end = match block.find('"') {
                        Some(idx) => idx,
                        None => continue,
                    };
                    let video_id = &block[..id_end];
                    if video_id.len() != 11 {
                        continue;
                    }

                    // Limit inspection slice to the current videoRenderer block
                    let slice = &block[..block.len().min(4500)];

                    let title = extract_json_string_after(slice, "\"title\":{\"runs\":[{\"text\":")
                        .or_else(|| extract_json_string_after(slice, "\"title\":{\"simpleText\":"))
                        .unwrap_or_default();

                    if title.is_empty() {
                        continue;
                    }

                    let channel = extract_json_string_after(slice, "\"longBylineText\":{\"runs\":[{\"text\":")
                        .or_else(|| extract_json_string_after(slice, "\"ownerText\":{\"runs\":[{\"text\":"))
                        .or_else(|| extract_json_string_after(slice, "\"shortBylineText\":{\"runs\":[{\"text\":"))
                        .unwrap_or_else(|| "YouTube".to_string());

                    let duration = extract_json_string_after(slice, "\"lengthText\":{\"simpleText\":")
                        .unwrap_or_else(|| {
                            if slice.contains("\"style\":\"LIVE\"") || slice.contains("\"isLive\":true") {
                                "LIVE".to_string()
                            } else {
                                "".to_string()
                            }
                        });

                    if !videos.iter().any(|v| v.video_id == video_id) {
                        videos.push(YouTubeVideoItem {
                            video_id: video_id.to_string(),
                            title,
                            channel,
                            duration,
                            thumbnail: format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", video_id),
                        });
                    }
                }
            }
        }
    }

    Ok(videos)
}

fn extract_href(s: &str) -> String {
    if let Some(href_idx) = s.find("href=") {
        let rest = s[href_idx + 5..].trim_start();
        if rest.starts_with('"') {
            let inner = &rest[1..];
            if let Some(end_idx) = inner.find('"') {
                return inner[..end_idx].to_string();
            }
        } else if rest.starts_with('\'') {
            let inner = &rest[1..];
            if let Some(end_idx) = inner.find('\'') {
                return inner[..end_idx].to_string();
            }
        }
    }
    String::new()
}

fn strip_html_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            out.push(c);
        }
    }
    out.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

fn urlencode(s: &str) -> String {
    let mut result = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
            result.push(c);
        } else if c == ' ' {
            result.push('+');
        } else {
            for b in c.to_string().as_bytes() {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_bing_u() {
        let input = "https://www.bing.com/ck/a?!&&p=059861e43bc3bdf8631618a99f761c127746fb75da938e7944110f76d94b1e8cJmltdHM9MTc5MTU5MDQwMA&ptn=3&ver=2&hsh=4&fclid=13ab279b-ab7e-6b2e-2dc9-3075aa726adb&u=a1aHR0cHM6Ly93d3cuYXBwbGUuY29tL2l0L3N0b3Jl&ntb=1";
        assert_eq!(decode_bing_u(input), "https://www.apple.com/it/store");

        let input_html = "https://www.bing.com/ck/a?!&amp;&amp;p=059861e43bc3bdf8631618a99f761c127746fb75da938e7944110f76d94b1e8cJmltdHM9MTc5MTU5MDQwMA&amp;ptn=3&amp;ver=2&amp;hsh=4&amp;fclid=13ab279b-ab7e-6b2e-2dc9-3075aa726adb&amp;u=a1aHR0cHM6Ly93d3cuYXBwbGUuY29tL2l0L3N0b3Jl&amp;ntb=1";
        assert_eq!(decode_bing_u(input_html), "https://www.apple.com/it/store");
    }

    #[test]
    fn test_spam_and_social_filter() {
        assert!(is_unwanted_or_spam("https://www.linkedin.com/in/johndoe", "John Doe | LinkedIn", "john"));
        assert!(is_unwanted_or_spam("https://www.facebook.com/people/john/123", "John Profile", "john"));
        assert!(is_unwanted_or_spam("https://coupons.retailmenot.com/deal", "Discount Deal", "laptop"));
        // Legitimate sites must NOT be filtered
        assert!(!is_unwanted_or_spam("https://en.wikipedia.org/wiki/John", "John - Wikipedia", "john"));
        assert!(!is_unwanted_or_spam("https://www.apple.com/it/store", "Apple Store", "apple"));
    }

    #[test]
    fn test_clean_tracking_url() {
        let dirty = "https://www.johnlewis.com/?msockid=0b3e20d2c71d69be34f5373cc6a768af&utm_source=bing";
        assert_eq!(clean_tracking_url(dirty), "https://www.johnlewis.com/");
    }

    #[test]
    fn test_direct_navigation() {
        let direct = check_direct_navigation("github").unwrap();
        assert_eq!(direct.url, "https://github.com");

        let direct_domain = check_direct_navigation("news.ycombinator.com").unwrap();
        assert_eq!(direct_domain.url, "https://news.ycombinator.com");
    }
}
