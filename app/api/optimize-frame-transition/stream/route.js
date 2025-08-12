import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const prompt = formData.get('prompt');
    const language = formData.get('language') || 'zh';
    const firstFrame = formData.get('firstFrame');
    const lastFrame = formData.get('lastFrame');

    // 验证输入
    if (!prompt || !firstFrame || !lastFrame) {
      return NextResponse.json(
        { error: '缺少必要参数：提示词、首帧或尾帧图片' },
        { status: 400 }
      );
    }

    // 获取API密钥
    const apiKey = process.env.AIHUBMIX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API密钥未配置' },
        { status: 500 }
      );
    }

    // 将图片转换为Base64
    const firstFrameBuffer = await firstFrame.arrayBuffer();
    const lastFrameBuffer = await lastFrame.arrayBuffer();
    const firstFrameBase64 = Buffer.from(firstFrameBuffer).toString('base64');
    const lastFrameBase64 = Buffer.from(lastFrameBuffer).toString('base64');

    // 构建Gemini API请求
    const systemPrompt = language === 'en' 
      ? `You are a professional video prompt optimization expert. Analyze the provided first and last frame images, understand the transition process between them, and optimize the user's prompt to create a detailed video generation prompt that describes the smooth transition from the first frame to the last frame.

Please follow these guidelines:
1. Carefully analyze the visual differences between the two frames
2. Describe the transition process, including changes in objects, lighting, camera movement, etc.
3. Combine with the user's original prompt to create a comprehensive video prompt
4. Use professional video generation terminology
5. Ensure the prompt is detailed and specific for optimal video generation results

Please respond in English and provide only the optimized prompt without additional explanations.`
      : `你是专业的视频提示词优化专家。请分析提供的首帧和尾帧图片，理解两者之间的过渡过程，并优化用户的提示词，生成详细的视频生成提示词，描述从首帧到尾帧的平滑过渡。

请遵循以下准则：
1. 仔细分析两张图片的视觉差异
2. 描述过渡过程，包括物体变化、光线变化、镜头运动等
3. 结合用户原始提示词，生成综合性的视频提示词
4. 使用专业的视频生成术语
5. 确保提示词详细具体，以获得最佳的视频生成效果

请用中文回复，只提供优化后的提示词，不要额外的解释说明。`;

    const requestBody = {
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemPrompt}\n\n用户原始提示词：${prompt}`
            },
            {
              inline_data: {
                mime_type: firstFrame.type,
                data: firstFrameBase64
              }
            },
            {
              inline_data: {
                mime_type: lastFrame.type,
                data: lastFrameBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 2048
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    };

    // 调用Gemini API - 使用与其他功能一致的代理端点
    const response = await fetch(
      `https://aihubmix.com/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API错误:', errorText);
      return NextResponse.json(
        { error: 'AI服务暂时不可用，请稍后重试' },
        { status: 500 }
      );
    }

    // 创建流式响应 - 保持原有格式但修复完成事件
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body.getReader();
          let buffer = '';
          let completeText = '';

          console.log('🔄 开始处理首尾帧视频流式响应...');

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += new TextDecoder().decode(value);
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() && line.startsWith('data: ')) {
                try {
                  const jsonStr = line.slice(6);
                  console.log('🔍 解析JSON:', jsonStr.substring(0, 100) + (jsonStr.length > 100 ? '...' : ''));

                  const data = JSON.parse(jsonStr);

                  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    const content = data.candidates[0].content;
                    if (content.parts && content.parts[0] && content.parts[0].text) {
                      const text = content.parts[0].text;
                      completeText += text;

                      console.log('📝 发送文本:', text.length, '字符');
                      // 保持原有的 { text: "..." } 格式
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                    }
                  }
                } catch (parseError) {
                  console.error('🔍 JSON解析错误:', parseError.message);
                  console.error('🔍 原始数据:', line);
                }
              }
            }
          }

          console.log('✅ 首尾帧视频流式响应处理完成，总文本长度:', completeText.length);

          // 发送完成事件 - 使用 [DONE] 格式但确保前端能正确处理
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('❌ 首尾帧视频流处理错误:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (error) {
    console.error('API路由错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}