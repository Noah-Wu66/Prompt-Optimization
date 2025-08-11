import { NextResponse } from 'next/server';
import OpenAI from 'openai';

function createClient() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  return new OpenAI({ apiKey, baseURL: 'https://aihubmix.com/v1' });
}

export async function POST(req) {
  try {
    const { prompt, language = 'en' } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
    }

    const client = createClient();
    const outputLang = language === 'zh' ? '中文' : '英文';
    const optimizeInput = `你是一名资深图像提示词工程师。请将以下提示词优化为面向通用 AI 图像生成模型的高质量 ${outputLang} Prompt，要求：
- 用简洁清晰的结构描述主体、场景、造型、构图、镜头、光照、材质、配色、风格、后期等；
- 使用逗号分隔短语，避免长句；
- 尽量补全缺失但常见且合理的细节；
- 不要包含画幅比例、尺寸规格等技术参数（如 3:2 aspect ratio, 16:9, 1024x1024 等）；
- 输出仅给最终 ${outputLang} Prompt，不要解释。

原始提示词（可能是中文）：\n${prompt}`;

    const params = {
      model: 'gpt-5',
      input: optimizeInput,
      reasoning: { effort: 'high' },
      text: { verbosity: 'low' },
      stream: true,
    };

    const eventStream = await client.responses.create(params);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of eventStream) {
            // 调试日志：记录所有事件类型和结构
            console.log('🔄 流式事件:', JSON.stringify(event, null, 2));
            console.log('🔄 事件类型:', event.type);
            console.log('🔄 事件键:', Object.keys(event || {}));
            
            // 特别关注推理相关的事件
            if (event.type && (/reason/i).test(event.type)) {
              console.log('🧠 推理事件详情:', JSON.stringify(event, null, 2));
            }
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch (e) {
          console.error('❌ 流式处理错误:', e);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.error', error: { message: String(e) } })}\n\n`));
        } finally {
          console.log('✅ 流式处理完成');
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Streaming route error:', err);
    return NextResponse.json({ error: err.message || '服务器错误' }, { status: 500 });
  }
}


