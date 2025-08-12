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

    // 将图片转换为Base64，并检查大小
    const firstFrameBuffer = await firstFrame.arrayBuffer();
    const lastFrameBuffer = await lastFrame.arrayBuffer();

    // 检查图片大小，如果过大则提示用户
    const maxSize = 4 * 1024 * 1024; // 4MB限制
    if (firstFrameBuffer.byteLength > maxSize) {
      return NextResponse.json(
        { error: `首帧图片过大（${Math.round(firstFrameBuffer.byteLength / 1024 / 1024)}MB），请压缩至4MB以下` },
        { status: 400 }
      );
    }
    if (lastFrameBuffer.byteLength > maxSize) {
      return NextResponse.json(
        { error: `尾帧图片过大（${Math.round(lastFrameBuffer.byteLength / 1024 / 1024)}MB），请压缩至4MB以下` },
        { status: 400 }
      );
    }

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
    console.log('🚀 准备调用Gemini API...');
    console.log('📋 请求体大小:', JSON.stringify(requestBody).length, '字符');
    console.log('📋 图片信息:', {
      firstFrame: { type: firstFrame.type, size: firstFrameBase64.length },
      lastFrame: { type: lastFrame.type, size: lastFrameBase64.length }
    });

    // 添加超时和重试机制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

    let response;
    try {
      response = await fetch(
        `https://aihubmix.com/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    console.log('📡 Gemini API响应状态:', response.status, response.statusText);
    console.log('📡 响应头:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API错误:', errorText);

      // 根据错误状态码提供更具体的错误信息
      let errorMessage = 'AI服务暂时不可用，请稍后重试';
      if (response.status === 413) {
        errorMessage = '图片文件过大，请压缩后重试';
      } else if (response.status === 429) {
        errorMessage = '请求过于频繁，请稍后重试';
      } else if (response.status >= 500) {
        errorMessage = '服务器内部错误，请稍后重试';
      }

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    // 创建流式响应 - 与其他API保持一致的格式和错误处理
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body.getReader();
          let buffer = '';
          let completeText = '';
          let hasReceivedData = false;

          console.log('🔄 开始处理首尾帧视频流式响应...');

          while (true) {
            let readResult;
            try {
              readResult = await reader.read();
            } catch (readError) {
              console.error('❌ 读取流数据时发生错误:', readError);
              if (readError.name === 'AbortError') {
                throw new Error('请求超时，请检查网络连接或稍后重试');
              }
              throw new Error('网络连接中断，请重试');
            }

            const { done, value } = readResult;
            if (done) {
              console.log('📡 流式读取完成');
              break;
            }

            const chunk = new TextDecoder().decode(value);
            buffer += chunk;
            hasReceivedData = true;
            console.log('📦 收到数据块:', chunk.length, '字符');
            console.log('📦 数据块内容:', JSON.stringify(chunk));
            console.log('📦 当前缓冲区总长度:', buffer.length);

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            console.log('📦 分割后得到', lines.length, '行，剩余缓冲区:', buffer.length, '字符');

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              console.log(`📋 处理第${i+1}行:`, JSON.stringify(line));

              if (line.trim() && line.startsWith('data: ')) {
                try {
                  const jsonStr = line.slice(6);
                  console.log('🔍 提取JSON字符串:', JSON.stringify(jsonStr));

                  const data = JSON.parse(jsonStr);
                  console.log('✅ JSON解析成功:', JSON.stringify(data, null, 2));

                  // 检查是否有错误
                  if (data.error) {
                    console.error('❌ API返回错误:', JSON.stringify(data.error, null, 2));
                    throw new Error(`API错误: ${data.error.message || JSON.stringify(data.error)}`);
                  }

                  // 检查是否有候选结果
                  if (data.candidates && data.candidates.length > 0) {
                    const candidate = data.candidates[0];
                    console.log('📄 找到候选结果:', JSON.stringify(candidate, null, 2));

                    // 检查是否被安全过滤器阻止
                    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                      console.warn('⚠️ 内容被过滤:', candidate.finishReason);
                      if (candidate.finishReason === 'SAFETY') {
                        throw new Error('内容被安全过滤器阻止，请尝试修改提示词或图片');
                      }
                    }

                    if (candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
                      const text = candidate.content.parts[0].text;
                      completeText += text;

                      console.log('📝 提取到文本:', JSON.stringify(text));
                      console.log('📝 累计文本长度:', completeText.length);
                      console.log('📝 发送给前端的数据:', JSON.stringify({ text }));

                      // 保持原有的 { text: "..." } 格式
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                      console.log('✅ 已发送文本数据到前端');
                    } else {
                      console.log('⚠️ candidate.content.parts 结构不符合预期');
                      console.log('⚠️ candidate结构:', JSON.stringify(candidate, null, 2));
                    }
                  } else {
                    console.log('⚠️ 没有找到candidates或candidates为空');
                    console.log('⚠️ 完整响应数据:', JSON.stringify(data, null, 2));
                  }
                } catch (parseError) {
                  console.error('❌ JSON解析错误:', parseError.message);
                  console.error('❌ 原始行数据:', JSON.stringify(line));
                  console.error('❌ 提取的JSON字符串:', JSON.stringify(line.slice(6)));
                }
              } else {
                console.log('⏭️ 跳过非data行:', JSON.stringify(line));
              }
            }
          }

          console.log('✅ 首尾帧视频流式响应处理完成');
          console.log('📊 最终统计:');
          console.log('  - 累计文本长度:', completeText.length);
          console.log('  - 累计文本内容:', JSON.stringify(completeText.substring(0, 200) + (completeText.length > 200 ? '...' : '')));

          // 如果没有收到任何文本内容，发送错误信息
          if (completeText.length === 0) {
            console.warn('⚠️ 没有收到任何文本内容，可能是API调用失败或内容被过滤');
            let errorText;
            if (!hasReceivedData) {
              errorText = '网络连接问题，请检查网络状态后重试。如果问题持续，可能是图片文件过大，请压缩后重试。';
            } else {
              errorText = '抱歉，无法处理您的图片。请检查图片是否清晰可见，或尝试修改提示词。';
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: errorText })}\n\n`));
          }

          // 发送完成事件 - 使用与其他API一致的格式
          const completeEvent = { type: 'response.completed' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`));
        } catch (error) {
          console.error('❌ 首尾帧视频流处理错误:', error);

          // 根据错误类型提供更具体的错误信息
          let errorMessage = String(error);
          if (error.message && error.message.includes('terminated')) {
            errorMessage = '网络连接被中断，可能是图片文件过大或网络不稳定。请尝试压缩图片或检查网络连接后重试。';
          } else if (error.message && error.message.includes('timeout')) {
            errorMessage = '请求超时，请检查网络连接或稍后重试。';
          } else if (error.message && error.message.includes('AbortError')) {
            errorMessage = '请求被取消，请重试。';
          }

          const errorEvent = {
            type: 'response.error',
            error: { message: errorMessage }
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        } finally {
          controller.close();
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