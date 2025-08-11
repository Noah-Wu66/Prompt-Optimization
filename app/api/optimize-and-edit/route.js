import { NextResponse } from 'next/server';
import OpenAI from 'openai';

async function readFileFromFormData(form) {
  const file = form.get('image');
  if (!file) return null;
  // Next.js App Router 中，formData 的文件是 Web File 对象
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, filename: file.name, type: file.type, webFile: file };
}

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
            if (block && typeof block.text === 'string' && block.text.trim()) pieces.push(block.text);
            if (block && Array.isArray(block.content)) {
              for (const inner of block.content) {
                if (inner && typeof inner.text === 'string' && inner.text.trim()) pieces.push(inner.text);
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
    const form = await req.formData();
    const prompt = form.get('prompt');
    const language = form.get('language') || 'en';
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
    }

    const fileObj = await readFileFromFormData(form);
    if (!fileObj) {
      return NextResponse.json({ error: '请上传参考图片' }, { status: 400 });
    }

    const client = createClient();

    // gpt-5 高级推理优化提示词，结合“图生图”语境（仅返回优化后的 Prompt，不做图片编辑）
    const base64 = fileObj.buffer.toString('base64');
    const dataUrl = `data:${fileObj.type || 'image/png'};base64,${base64}`;
    const outputLang = language === 'zh' ? '中文' : '英文';

    const resp = await client.responses.create({
      model: 'gpt-5',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                `你是一名资深图像提示词工程师。现在是图生图（image edit）场景，请将以下提示词优化为面向 AI 图像编辑的高质量 ${outputLang} Prompt，要求：\n` +
                '- 强调需要维持参考图的主体构成与关键风格特征，仅在细节、风格或光效上做可控变化；\n' +
                '- 条理化描述：主体、环境、构图、镜头、光照、材质、配色、风格、后期；\n' +
                '- 使用逗号分隔短语，避免长句；\n' +
                '- 输出仅给最终 ' + outputLang + ' Prompt，不要解释。\n\n' +
                `原始提示词（可能是中文）：\n${prompt}`,
            },
            { type: 'input_image', image_url: dataUrl },
          ],
        },
      ],
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
            {
              role: 'user',
              content:
                `图生图场景，给定一张参考图（已作为附件）和原始提示词，请输出优化后的${outputLang} Prompt，仅输出结果：\n\n${prompt}`,
            },
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


