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


