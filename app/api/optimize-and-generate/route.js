import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// 使用 Aihubmix 的 OpenAI 兼容 API
function createClient() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  const client = new OpenAI({ apiKey, baseURL: 'https://aihubmix.com/v1' });
  return client;
}

function extractTextFromResponses(resp) {
  if (!resp) return '';
  // Responses API common path
  const outputText = resp.output_text;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();

  try {
    const pieces = [];
    if (Array.isArray(resp.output)) {
      for (const item of resp.output) {
        if (item && Array.isArray(item.content)) {
          for (const block of item.content) {
            // OpenAI Responses blocks usually carry text directly
            if (block && typeof block.text === 'string' && block.text.trim()) {
              pieces.push(block.text);
            }
            // Some providers nest under block.content
            if (block && Array.isArray(block.content)) {
              for (const inner of block.content) {
                if (inner && typeof inner.text === 'string' && inner.text.trim()) {
                  pieces.push(inner.text);
                }
              }
            }
          }
        }
      }
    }
    if (pieces.length) return pieces.join('\n').trim();
  } catch (_) {}

  // Chat Completions compatible path
  try {
    if (Array.isArray(resp.choices) && resp.choices.length > 0) {
      const ch = resp.choices[0];
      const msgContent = ch?.message?.content ?? ch?.delta?.content ?? ch?.text;
      if (typeof msgContent === 'string' && msgContent.trim()) return msgContent.trim();
      if (Array.isArray(msgContent)) {
        const buf = [];
        for (const part of msgContent) {
          if (typeof part === 'string' && part.trim()) buf.push(part);
          else if (part && typeof part.text === 'string' && part.text.trim()) buf.push(part.text);
          else if (part && part.type === 'text' && typeof part.text === 'string' && part.text.trim()) buf.push(part.text);
        }
        if (buf.length) return buf.join('\n').trim();
      }
    }
  } catch (_) {}

  return '';
}

export async function POST(req) {
  try {
    const { prompt, language = 'en' } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
    }

    const client = createClient();

    // gpt-5 高级推理优化提示词（不做图片生成，仅返回优化后的 Prompt）
    const outputLang = language === 'zh' ? '中文' : '英文';
    const optimizeInput = `你是一名资深图像提示词工程师。请将以下提示词优化为面向通用 AI 图像生成模型的高质量 ${outputLang} Prompt，要求：
- 用简洁清晰的结构描述主体、场景、造型、构图、镜头、光照、材质、配色、风格、后期、画幅比例等；
- 使用逗号分隔短语，避免长句；
- 尽量补全缺失但常见且合理的细节；
- 输出仅给最终 ${outputLang} Prompt，不要解释。

原始提示词（可能是中文）：\n${prompt}`;

    const resp = await client.responses.create({
      model: 'gpt-5',
      input: optimizeInput,
      reasoning: { effort: 'high' },
      text: { verbosity: 'low' },
      max_output_tokens: 800,
    });

    let optimizedPrompt = extractTextFromResponses(resp) || '';

    // Fallback: try Chat Completions if Responses API returned empty
    if (!optimizedPrompt) {
      try {
        const chat = await client.chat.completions.create({
          model: 'gpt-5',
          messages: [
            {
              role: 'system',
              content: `你是一名资深图像提示词工程师。严格输出${outputLang}优化后的 Prompt，只输出结果，不要解释。`,
            },
            { role: 'user', content: optimizeInput },
          ],
          max_tokens: 800,
          temperature: 0.3,
        });
        optimizedPrompt = extractTextFromResponses(chat) || '';
      } catch (_) {
        // ignore and let fallback happen
      }
    }

    return NextResponse.json({ optimizedPrompt: optimizedPrompt || prompt, language });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || '服务器错误' }, { status: 500 });
  }
}


