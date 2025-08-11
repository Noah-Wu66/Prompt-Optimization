import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('=== 检查配置 ===');
    
    const apiKey = process.env.AIHUBMIX_API_KEY;
    console.log('API Key 存在:', !!apiKey);
    console.log('API Key 长度:', apiKey?.length || 0);
    console.log('API Key 前缀:', apiKey?.substring(0, 8) + '...' || 'undefined');
    
    const config = {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      apiKeyPrefix: apiKey?.substring(0, 8) + '...' || 'undefined',
      baseUrl: 'https://aihubmix.com/v1',
      nodeEnv: process.env.NODE_ENV,
    };
    
    console.log('配置信息:', config);
    
    return NextResponse.json({
      success: true,
      config,
      message: apiKey ? '配置检查通过' : '❌ 缺少 AIHUBMIX_API_KEY 环境变量'
    });
  } catch (err) {
    console.error('配置检查失败:', err);
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}
