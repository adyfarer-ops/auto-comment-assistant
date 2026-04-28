const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../../config');
const logger = require('../utils/logger');
const { createProxyAgent } = require('../utils/proxy');

class VideoAnalysisService {
  constructor() {
    this.agent = createProxyAgent();
    this.tempDir = path.join(process.cwd(), 'temp', 'videos');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async analyzeVideo(videoUrl, options = {}) {
    const videoPath = await this.downloadVideo(videoUrl);
    try {
      const keyframes = await this.extractKeyframes(videoPath, options.maxFrames || 5);
      const analysis = await this.callVisionAI(keyframes, options.prompt);
      return { videoPath, keyframes, analysis };
    } finally {
      if (!options.keepVideo) {
        this.cleanup(videoPath);
      }
    }
  }

  async downloadVideo(videoUrl) {
    const filename = `video_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
    const destPath = path.join(this.tempDir, filename);

    logger.info('Downloading video', { videoUrl: videoUrl.slice(0, 80) });

    const response = await axios.get(videoUrl, {
      responseType: 'stream',
      timeout: 120000,
      httpsAgent: this.agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    logger.info('Video downloaded', { destPath, size: fs.statSync(destPath).size });
    return destPath;
  }

  async extractKeyframes(videoPath, maxFrames = 5) {
    return new Promise((resolve, reject) => {
      const durationCmd = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ]);

      let duration = 0;
      durationCmd.stdout.on('data', (data) => {
        duration = parseFloat(data.toString().trim()) || 0;
      });

      durationCmd.on('close', () => {
        if (duration <= 0) {
          return reject(new Error('Could not determine video duration'));
        }

        const interval = duration / (maxFrames + 1);
        const frames = [];
        const baseName = path.basename(videoPath, path.extname(videoPath));

        const extractPromises = [];
        for (let i = 1; i <= maxFrames; i++) {
          const time = interval * i;
          const framePath = path.join(this.tempDir, `${baseName}_frame_${i}.jpg`);
          frames.push(framePath);

          extractPromises.push(
            new Promise((res, rej) => {
              const ffmpeg = spawn('ffmpeg', [
                '-ss', String(time),
                '-i', videoPath,
                '-vframes', '1',
                '-q:v', '2',
                '-y',
                framePath,
              ]);
              ffmpeg.on('close', (code) => {
                if (code === 0) res(framePath);
                else rej(new Error(`ffmpeg exited with code ${code}`));
              });
            })
          );
        }

        Promise.all(extractPromises)
          .then(() => resolve(frames))
          .catch(reject);
      });
    });
  }

  async analyzeVideoDirect(videoUrl, options = {}) {
    const prompt = options.prompt || '请分析这个视频的内容，描述画面风格、主要元素、氛围、节奏，并给出内容运营建议。';

    const messages = [
      { role: 'system', content: '你是一位资深的多模态内容分析师，擅长从视频中提取视觉信息并生成专业的内容分析。' },
      { role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'video_url', video_url: { url: videoUrl } },
      ]},
    ];

    try {
      const response = await axios.post(
        `${config.ai.videoAnalysis.baseUrl}/chat/completions`,
        {
          model: 'doubao-seed-2-0-pro-260215',
          messages,
          max_tokens: 2048,
        },
        {
          headers: {
            Authorization: `Bearer ${config.ai.videoAnalysis.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 180000,
          httpsAgent: this.agent,
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Direct video analysis failed', { videoUrl: videoUrl.slice(0, 80), error: error.message });
      throw error;
    }
  }

  async callVisionAI(imagePaths, customPrompt) {
    const prompt = customPrompt || '请分析这张图片的内容，描述画面中的主要元素、风格、氛围，并给出适合社交媒体传播的标题建议。';

    // 读取图片并转为 base64
    const images = imagePaths.map(p => {
      const data = fs.readFileSync(p);
      return `data:image/jpeg;base64,${data.toString('base64')}`;
    });

    const messages = [
      { role: 'system', content: '你是一位资深的多模态内容分析师，擅长从视频关键帧中提取视觉信息并生成专业的内容分析。' },
      { role: 'user', content: [{ type: 'text', text: prompt }, ...images.map(img => ({ type: 'image_url', image_url: { url: img } }))] },
    ];

    try {
      const response = await axios.post(
        `${config.ai.videoAnalysis.baseUrl}/chat/completions`,
        {
          model: 'doubao-seed-2-0-pro-260215',
          messages,
          max_tokens: 2048,
        },
        {
          headers: {
            Authorization: `Bearer ${config.ai.videoAnalysis.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
          httpsAgent: this.agent,
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Vision AI analysis failed', { error: error.message });
      throw error;
    }
  }

  cleanup(videoPath) {
    try {
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      const baseName = path.basename(videoPath, path.extname(videoPath));
      const files = fs.readdirSync(this.tempDir);
      files.filter(f => f.startsWith(baseName)).forEach(f => {
        fs.unlinkSync(path.join(this.tempDir, f));
      });
    } catch (error) {
      logger.error('Cleanup failed', { error: error.message });
    }
  }
}

module.exports = new VideoAnalysisService();
