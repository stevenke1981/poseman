import { JOINT_NAMES } from './mannequin.js';
import { PRESET_LABELS } from './poses.js';
import { PROP_TYPES } from './props.js';

const SETTINGS_KEY = 'poseman-ai-settings-v1';

export function loadAISettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveAISettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function aiConfigured(s = loadAISettings()) {
  return Boolean(s.baseUrl && s.model);
}

export function buildSystemPrompt(snapshot) {
  return `你是 PoseMan（3D 姿勢人偶參考工具）的內建助手。使用者用自然語言（常為繁體中文）下指令；你只回覆嚴格 JSON（不要 markdown、不要解釋）：
{"actions":[...],"reply":"給使用者的簡短回覆（繁體中文）"}
可用動作（figure/prop 為 0 起索引；角度為度，範圍 -180..180）：
{"op":"setJoint","figure":0,"joint":"shoulderL","rot":[x,y,z]}
{"op":"addJoint","figure":0,"joint":"elbowR","delta":[x,y,z]}
{"op":"preset","figure":0,"preset":"walk"}
{"op":"resetPose","figure":0}
{"op":"moveFigure","figure":0,"x":0,"z":0}
{"op":"addFigure","female":false}
{"op":"removeFigure","figure":1}
{"op":"addProp","type":"chair","x":0,"z":1,"rotY":0}
{"op":"moveProp","prop":0,"x":0,"z":1}
{"op":"rotateProp","prop":0,"deg":45}
{"op":"removeProp","prop":0}
關節：${JOINT_NAMES.join(', ')}（L=角色自身左側）。
約定：角色面向 +Z；rotation.x 負值＝肢体向前、正值向後；rotation.z 正值＝左側向外、負值＝右側向外。
姿勢範本：${Object.keys(PRESET_LABELS).join(', ')}。
物品：${Object.keys(PROP_TYPES).join(', ')}。
目前場景：${JSON.stringify(snapshot)}
指令不明或純聊天時用 "actions":[] 並在 reply 回答。`;
}

export function parseAIJSON(text) {
  const clean = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 未回傳可解析的 JSON');
  const obj = JSON.parse(clean.slice(start, end + 1));
  return {
    actions: Array.isArray(obj.actions) ? obj.actions : [],
    reply: String(obj.reply || ''),
    raw: text,
  };
}

// OpenAI-compatible chat completions (works with OpenAI / Groq / OpenRouter /
// DeepSeek / DashScope compatible-mode / Ollama / LM Studio …).
export async function requestAI(settings, systemPrompt, history, userText) {
  const base = String(settings.baseUrl).replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseAIJSON(text);
}
