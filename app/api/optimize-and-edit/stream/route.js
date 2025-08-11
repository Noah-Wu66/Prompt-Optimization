import { NextResponse } from 'next/server';
import { genai, types } from 'google-genai';

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
  return genai.Client({
    api_key: apiKey,
    http_options: { base_url: "https://aihubmix.com/gemini" }
  });
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
    const outputLang = language === 'zh' ? '中文' : '英文';
    const optimizeInput = `你是一名资深图像提示词工程师。现在是图生图（image edit）场景，请将以下提示词优化为面向 AI 图像编辑的高质量 ${outputLang} Prompt，要求：
- 强调需要维持参考图的主体构成与关键风格特征，仅在细节、风格或光效上做可控变化；
- 条理化描述：主体、环境、构图、镜头、光照、材质、配色、风格、后期；
- 使用逗号分隔短语，避免长句；
- 不要包含画幅比例、尺寸规格等技术参数（如 3:2 aspect ratio, 16:9, 1024x1024 等）；
- 输出仅给最终 ${outputLang} Prompt，不要解释。

原始提示词（可能是中文）：
${prompt}`;

    const model = "gemini-2.5-flash";
    const contents = [
      types.Content({
        role: "user",
        parts: [
          types.Part.from_text({ text: optimizeInput }),
          types.Part({
            inline_data: types.Blob({
              data: fileObj.buffer,
              mime_type: fileObj.type || "image/png"
            })
          }),
        ],
      }),
    ];

    const generateContentConfig = types.GenerateContentConfig({
      thinking_config: types.ThinkingConfig({
        thinking_budget: 16384, // 使用最高推理预算
      }),
      media_resolution: types.MediaResolution.MEDIA_RESOLUTION_HIGH, // 高分辨率处理图片
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of client.models.generate_content_stream({
            model: model,
            contents: contents,
            config: generateContentConfig,
          })) {
            if (chunk.candidates) {
              for (const candidate of chunk.candidates) {
                if (candidate.content && candidate.content.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.text && !part.thought) { // 只发送最终答案，不发送思考过程
                      const event = {
                        type: 'response.output_text.delta',
                        delta: part.text
                      };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                    }
                  }
                }
              }
            }
          }
          // 发送完成事件
          const completeEvent = { type: 'response.completed' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`));
        } catch (e) {
          const errorEvent = { 
            type: 'response.error', 
            error: { message: String(e) } 
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        } finally {
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