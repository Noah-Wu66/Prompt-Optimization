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
  
  // 尝试直接获取文本内容（非流式响应）
  if (typeof resp === 'string') return resp.trim();
  
  // 检查 output_text 字段
  if (typeof resp.output_text === 'string' && resp.output_text.trim()) {
    return resp.output_text.trim();
  }
  
  // 检查 output 数组中的内容
  if (Array.isArray(resp.output)) {
    const pieces = [];
    for (const item of resp.output) {
      if (item && typeof item.text === 'string') {
        pieces.push(item.text);
      } else if (item && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c && typeof c.text === 'string') pieces.push(c.text);
        }
      }
    }
    if (pieces.length > 0) return pieces.join('\n').trim();
  }
  
  // 检查其他可能的响应格式
  if (resp.choices && Array.isArray(resp.choices)) {
    for (const choice of resp.choices) {
      if (choice.message && typeof choice.message.content === 'string') {
        return choice.message.content.trim();
      }
    }
  }
  
  // 最后尝试检查所有可能的文本字段
  const possibleFields = ['content', 'text', 'message', 'result'];
  for (const field of possibleFields) {
    if (resp[field] && typeof resp[field] === 'string' && resp[field].trim()) {
      return resp[field].trim();
    }
  }
  
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

    // 调试日志：打印响应结构
    console.log('API Response:', JSON.stringify(resp, null, 2));

    const optimizedPrompt = extractTextFromResponses(resp) || '';
    
    // 调试日志：打印提取的结果
    console.log('Extracted prompt:', optimizedPrompt);

    return NextResponse.json({ optimizedPrompt: optimizedPrompt || prompt, language });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || '服务器错误' }, { status: 500 });
  }
}


