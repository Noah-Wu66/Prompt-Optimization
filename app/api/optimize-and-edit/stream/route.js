import { NextResponse } from 'next/server';
import OpenAI from 'openai';

async function readFileFromFormData(form) {
  const file = form.get('image');
  if (!file) return null;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, filename: file.name, type: file.type };
}

function createClient() {
  const apiKey = process.env.AIHUBMIX_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 AIHUBMIX_API_KEY 环境变量');
  }
  return new OpenAI({ apiKey, baseURL: 'https://aihubmix.com/v1' });
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
    const base64 = fileObj.buffer.toString('base64');
    const dataUrl = `data:${fileObj.type || 'image/png'};base64,${base64}`;
    const outputLang = language === 'zh' ? '中文' : '英文';

    const params = {
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
                '- 不要包含画幅比例、尺寸规格等技术参数（如 3:2 aspect ratio, 16:9, 1024x1024 等）；\n' +
                '- 输出仅给最终 ' + outputLang + ' Prompt，不要解释。\n\n' +
                `原始提示词（可能是中文）：\n${prompt}`,
            },
            { type: 'input_image', image_url: dataUrl },
          ],
        },
      ],
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


