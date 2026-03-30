// platforms/douyin-note.js - 抖音图文处理逻辑（完全按照备份代码，添加反馈信息）
const { sendProgressMessage, updateRecordField } = require('../utils/utils');

// 通用评论输入和发送逻辑（完全复制备份代码，添加反馈）
async function inputAndSendComment(page, commentInput, data, token, contentType) {
  console.log('[AUTO] Inputting and sending comment...');
  console.log('[AUTO] Content type:', contentType);

  // 滚动到评论框位置
  try {
    await commentInput.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 500));
  } catch(e) {}

  // 点击评论框 - 使用多种方式确保激活
  let activated = false;

  // 方式1: 直接点击
  try {
    await commentInput.click();
    console.log('[AUTO] Clicked comment input (direct)');
    activated = true;
  } catch(e) {
    console.log('[AUTO] Direct click failed:', e.message);
  }

  // 方式2: 点击输入框内的特定位置（模拟真实用户点击）
  if (!activated) {
    try {
      const box = await commentInput.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        console.log('[AUTO] Clicked comment input center position');
        activated = true;
      }
    } catch(e) {
      console.log('[AUTO] Center click failed:', e.message);
    }
  }

  // 方式3: JavaScript 点击
  if (!activated) {
    try {
      await commentInput.evaluate(el => {
        const child = el.querySelector('[contenteditable="true"]') ||
                     el.querySelector('div') ||
                     el;
        child.click();
        child.focus();
      });
      console.log('[AUTO] Clicked comment input child element');
      activated = true;
    } catch(e) {
      console.log('[AUTO] Child click failed:', e.message);
    }
  }

  // 方式4: dispatchEvent
  if (!activated) {
    try {
      await commentInput.evaluate(el => {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        el.dispatchEvent(clickEvent);
      });
      console.log('[AUTO] Clicked comment input (dispatch)');
      activated = true;
    } catch(e) {
      console.log('[AUTO] Dispatch click failed:', e.message);
    }
  }

  if (!activated) {
    console.log('[AUTO] Failed to activate comment input');
    return { success: false, message: '无法激活评论框' };
  }

  // 等待激活完成
  await new Promise(r => setTimeout(r, 1500));

  // 根据内容类型使用不同的聚焦逻辑
  if (contentType === 'douyin_note') {
    console.log('[AUTO] Using douyin_note specific focus logic');
    try {
      await commentInput.evaluate(el => {
        el.focus();
      });
      console.log('[AUTO] Simple focus for douyin_note');
    } catch(e) {
      console.log('[AUTO] Simple focus failed:', e.message);
    }
  } else if (contentType === 'douyin_video') {
    console.log('[AUTO] Using douyin_video specific focus logic');
    try {
      await commentInput.click();
      await new Promise(r => setTimeout(r, 1000));
      await commentInput.evaluate(el => el.focus());
      await new Promise(r => setTimeout(r, 500));
      console.log('[AUTO] Focused for douyin_video');
    } catch(e) {
      console.log('[AUTO] Video focus failed:', e.message);
    }
  } else {
    // 其他平台的完整聚焦逻辑
    try {
      await commentInput.evaluate(el => {
        el.focus();
        if (el.contentEditable === 'true' || el.contentEditable === 'inherit') {
          el.innerHTML = '';
          const range = document.createRange();
          const sel = window.getSelection();
          range.setStart(el, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          el.value = '';
          el.setSelectionRange(0, 0);
        }
        el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      });
      console.log('[AUTO] Focused and positioned cursor');
    } catch(e) {
      console.log('[AUTO] Focus failed:', e.message);
    }
  }

  // 等待光标出现
  await new Promise(r => setTimeout(r, 800));

  // 使用多种方式输入评论
  console.log('[AUTO] Typing comment:', data.comment_script);

  let inputSuccess = false;

  // 先确保页面有焦点
  try {
    await page.bringToFront();
    await new Promise(r => setTimeout(r, 200));
  } catch(e) {}

  // 方法1: 使用 keyboard 输入（最可靠的方式）
  try {
    console.log('[AUTO] Trying keyboard input...');
    await commentInput.click();
    await new Promise(r => setTimeout(r, 800));
    await commentInput.evaluate(el => {
      el.focus();
      el.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.type(data.comment_script, { delay: 50 });
    console.log('[AUTO] Typed with keyboard');
    inputSuccess = true;
  } catch(e) {
    console.log('[AUTO] Keyboard input failed:', e.message);
  }

  // 方法2: 如果 keyboard 失败，使用 evaluate 直接设置
  if (!inputSuccess) {
    try {
      console.log('[AUTO] Trying evaluate input...');
      await commentInput.evaluate((el, text) => {
        el.focus();
        el.click();
        if (el.contentEditable === 'true' || el.contentEditable === 'inherit') {
          el.innerHTML = '';
          const textNode = document.createTextNode(text);
          el.appendChild(textNode);
        } else {
          el.value = text;
        }
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        el.focus();
      }, data.comment_script);

      await new Promise(r => setTimeout(r, 500));

      const content = await commentInput.evaluate(el => el.innerText || el.value || '');
      if (content && content.includes(data.comment_script.substring(0, 10))) {
        console.log('[AUTO] Input successful using evaluate');
        inputSuccess = true;
      } else {
        console.log('[AUTO] Evaluate input verification failed, content:', content.substring(0, 30));
      }
    } catch(e) {
      console.log('[AUTO] Evaluate input failed:', e.message);
    }
  }

  if (!inputSuccess) {
    return { success: false, message: '输入评论失败' };
  }

  // 发送反馈：评论内容已输入
  await sendProgressMessage(token, '✅ 评论内容已输入', data);
  console.log('[AUTO] Comment entered');
  await new Promise(r => setTimeout(r, 1500));

  // 查找发送按钮
  console.log('[AUTO] Looking for send button...');
  let sendButton = null;
  await new Promise(r => setTimeout(r, 1000));

  // 抖音发送按钮选择器（按优先级排序）
  const sendButtonSelectors = [
    'span.WFB7wUOX.NUzvFSPe',
    'span[class*="WFB7wUOX"][class*="NUzvFSPe"]',
    'div[class*="comment-input-right-ct"] span[class*="WFB7wUOX"]',
    'div[class*="GXmFLge7"] ~ div span[class*="WFB7wUOX"]',
    'span[class*="WFB7wUOX"]',
    'span[class*="NUzvFSPe"]',
    'div[class*="comment-input-right-ct"] svg',
    'svg[class*="WFB7wUOX"]',
  ];

  for (const selector of sendButtonSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        const className = await btn.evaluate(el => el.className || '');
        const tagName = await btn.evaluate(el => el.tagName);
        console.log('[AUTO] Found button:', selector, 'tag:', tagName, 'class:', className.substring(0, 30));
        sendButton = btn;
        break;
      }
    } catch(e) {}
  }

  if (sendButton) {
    console.log('[AUTO] Clicking send button...');

    let clicked = false;

    // 方式1: 直接点击
    try {
      await sendButton.click();
      console.log('[AUTO] Direct click success');
      clicked = true;
    } catch(e) {
      console.log('[AUTO] Direct click failed:', e.message);
    }

    // 方式2: 使用 evaluate 点击元素本身
    if (!clicked) {
      try {
        await sendButton.evaluate(el => el.click());
        console.log('[AUTO] Element click success');
        clicked = true;
      } catch(e) {
        console.log('[AUTO] Element click failed:', e.message);
      }
    }

    // 方式3: 使用 dispatchEvent 触发点击事件
    if (!clicked) {
      try {
        await sendButton.evaluate(el => {
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(clickEvent);
        });
        console.log('[AUTO] Dispatch click success');
        clicked = true;
      } catch(e) {
        console.log('[AUTO] Dispatch click failed:', e.message);
      }
    }

    // 方式4: 点击父元素
    if (!clicked) {
      try {
        await sendButton.evaluate(el => {
          if (el.parentElement) {
            el.parentElement.click();
          }
        });
        console.log('[AUTO] Parent click success');
        clicked = true;
      } catch(e) {
        console.log('[AUTO] Parent click failed:', e.message);
      }
    }

    if (clicked) {
      // 发送反馈：评论已发送
      await sendProgressMessage(token, '📤 评论已发送', data);
      console.log('[AUTO] Sent!');
    } else {
      return { success: false, message: '点击发送按钮失败' };
    }

    await new Promise(r => setTimeout(r, 3000));

  } else {
    console.log('[AUTO] Button not found, trying Enter key...');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));
  }

  return { success: true };
}

// 抖音图文处理流程（完全复制备份代码，添加反馈信息）
async function handleDouyinNote(page, token, data, browser) {
  // 发送反馈：开始处理抖音图文
  await sendProgressMessage(token, '📝 处理抖音图文...', data);
  console.log('[AUTO] Handling Douyin Note...');

  // 等待页面加载
  await new Promise(r => setTimeout(r, 2000));

  // 点击"评论"tab
  console.log('[AUTO] Clicking comment tab...');

  try {
    // 使用 evaluate 查找并点击评论 tab
    const result = await page.evaluate(() => {
      // 方法1: 先尝试查找具有特定 class 的 tab
      const tabSelectors = [
        'div[class*="cxpsBymd"]',
        'div[class*="kNtvycrk"]',
        'div[role="tab"]'
      ];

      for (const selector of tabSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          if (text.match(/^评论\s*\(\d+\)$/) || text.match(/评论\s*\(\d+\)/)) {
            const rect = el.getBoundingClientRect();
            if (rect.y > 100 && rect.y < 600 && text.length < 50) {
              el.click();
              return {
                found: true,
                text: text.substring(0, 30),
                y: rect.y,
                className: el.className,
                method: 'selector'
              };
            }
          }
        }
      }

      // 方法2: 遍历所有元素，找最接近纯"评论(数字)"的
      const elements = document.querySelectorAll('div, span, button, a');
      let bestMatch = null;
      let bestLength = Infinity;

      for (const el of elements) {
        const text = el.textContent || '';
        if (text.match(/评论\s*\(\d+\)/)) {
          const rect = el.getBoundingClientRect();
          if (rect.y > 100 && rect.y < 600 && text.length < bestLength) {
            bestMatch = {
              element: el,
              text: text,
              y: rect.y,
              className: el.className,
              length: text.length
            };
            bestLength = text.length;
          }
        }
      }

      if (bestMatch) {
        bestMatch.element.click();
        return {
          found: true,
          text: bestMatch.text.substring(0, 30),
          y: bestMatch.y,
          className: bestMatch.className,
          method: 'bestMatch',
          length: bestMatch.length
        };
      }

      return { found: false };
    });

    if (!result.found) {
      console.log('[AUTO] Comment tab not found');
      return { commentInput: null };  // 返回对象让外部处理
    }

    console.log('[AUTO] Clicked comment tab:', result.text, 'y:', result.y, 'class:', result.className);
    // 发送反馈：已点击评论tab
    await sendProgressMessage(token, '✅ 已点击评论tab', data);

    // 等待页面切换动画
    await new Promise(r => setTimeout(r, 2000));

    // 滚动到评论区（图文页面需要滚动才能看到评论框）
    console.log('[AUTO] Scrolling to comment section...');

    // 多次滚动确保评论区可见
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const commentSection = document.querySelector('div[class*="comment"]') ||
                              document.querySelector('div[class*="GXmFLge7"]') ||
                              document.querySelector('div[contenteditable="true"]');
        if (commentSection) {
          commentSection.scrollIntoView({ behavior: 'instant', block: 'center' });
        } else {
          window.scrollTo(0, document.body.scrollHeight);
        }
      });
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('[AUTO] Douyin Note: Tab switched and scrolled to comment section');

    // 等待评论区加载 - 增加等待时间
    console.log('[AUTO] Waiting for comment section to load...');
    await new Promise(r => setTimeout(r, 3000));

    // 查找评论框 - 参考抖音视频的逻辑
    console.log('[AUTO] Looking for comment input...');

    let commentInput = null;
    let attempts = 0;
    const maxAttempts = 15;

    // 抖音图文评论框选择器（按优先级排序）
    const noteSelectors = [
      'div.GXmFLge7.comment-input-inner-container',
      'div[class*="GXmFLge7"][class*="comment-input-inner-container"]',
      'div[class*="GXmFLge7"]',
      'div[class*="comment-input-inner-container"]',
      'div[contenteditable="true"]',
      'div[placeholder*="评论"]',
      'div[placeholder*="说点什么"]',
    ];

    while (!commentInput && attempts < maxAttempts) {
      // 方法1: 使用预设选择器
      for (const selector of noteSelectors) {
        try {
          const elements = await page.$$(selector);
          console.log(`[AUTO] Selector "${selector}" found ${elements.length} elements`);

          for (const el of elements) {
            const box = await el.boundingBox();
            const className = await el.evaluate(e => e.className);
            console.log(`[AUTO] Element: class="${className?.substring(0, 50)}", y=${box?.y}, visible=${box && box.width > 0}`);

            // 确保元素可见且在页面底部（评论区）
            if (box && box.width > 0 && box.height > 0 && box.y > 300) {
              commentInput = el;
              console.log('[AUTO] Found comment input with selector:', selector, 'y:', box.y);
              break;
            }
          }

          if (commentInput) break;
        } catch(e) {
          console.log(`[AUTO] Selector "${selector}" error:`, e.message);
        }
      }

      // 方法2: 查找所有 contenteditable 元素，选择最底部的
      if (!commentInput) {
        try {
          const inputs = await page.$$('div[contenteditable="true"]');
          console.log(`[AUTO] Found ${inputs.length} contenteditable elements`);

          let bestInput = null;
          let maxY = 0;

          for (const input of inputs) {
            try {
              const box = await input.boundingBox();
              const className = await input.evaluate(e => e.className);
              console.log(`[AUTO] contenteditable: class="${className?.substring(0, 50)}", y=${box?.y}`);

              if (box && box.y > maxY && box.y > 300) {
                maxY = box.y;
                bestInput = input;
              }
            } catch(e) {}
          }

          if (bestInput) {
            commentInput = bestInput;
            console.log('[AUTO] Found comment input at bottom, y:', maxY);
          }
        } catch(e) {}
      }

      if (!commentInput) {
        await new Promise(r => setTimeout(r, 800));
        attempts++;
        console.log(`[AUTO] Waiting for comment input... ${attempts}/${maxAttempts}`);
      }
    }

    if (!commentInput) {
      console.log('[AUTO] Comment input not found after all attempts');
      return { commentInput: null };  // 返回对象而不是 null，让外部处理登录等待
    }

    console.log('[AUTO] Comment input found');
    // 发送反馈：找到评论框
    await sendProgressMessage(token, '✅ 找到评论框', data);

    // 确保评论框在可视区域
    try {
      await commentInput.evaluate(el => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {}

    // 使用通用的输入和发送评论逻辑，传入内容类型
    const sendResult = await inputAndSendComment(page, commentInput, data, token, 'douyin_note');
    if (!sendResult.success) {
      return sendResult;
    }

    // 给自己的评论点赞
    console.log('[AUTO] Looking for like button on my comment...');
    try {
      await new Promise(r => setTimeout(r, 2000));

      // 查找刚发布的评论（包含"刚刚"文本的评论）
      let myComment = null;
      try {
        const commentHandle = await page.evaluateHandle(() => {
          const comments = document.querySelectorAll('div[class*="comment-item"], div[data-e2e*="comment-item"]');
          for (const comment of comments) {
            if (comment.textContent.includes('刚刚')) {
              return comment;
            }
          }
          return null;
        });
        if (commentHandle) {
          myComment = commentHandle.asElement();
          console.log('[AUTO] Found my comment (with 刚刚)');
        }
      } catch(e) {
        console.log('[AUTO] Error finding comment with 刚刚:', e.message);
      }

      // 如果没找到，尝试查找第一个评论
      if (!myComment) {
        myComment = await page.$('div[class*="comment-item"]:first-child, div[data-e2e*="comment-item"]:first-child');
        console.log('[AUTO] Using first comment as fallback');
      }

      if (myComment) {
        console.log('[AUTO] Found my comment element');

        // 在评论内查找点赞按钮
        let likeButton = await myComment.$('[class*="xZh"] svg, [class*="LeV"] svg');
        if (!likeButton) {
          likeButton = await myComment.$('[class*="xZh"], [class*="LeV"]');
        }
        if (!likeButton) {
          likeButton = await myComment.$('svg');
        }

        console.log('[AUTO] Like button search result:', likeButton ? 'found' : 'not found');

        if (likeButton) {
          console.log('[AUTO] Found like button, getting details...');
          try {
            const tagName = await likeButton.evaluate(el => el.tagName);
            let className = '';
            try {
              const rawClassName = await likeButton.evaluate(el => el.className);
              if (typeof rawClassName === 'string') {
                className = rawClassName;
              } else if (rawClassName && rawClassName.baseVal) {
                className = rawClassName.baseVal;
              }
            } catch(e) {}
            console.log('[AUTO] Like button - tag:', tagName, 'class:', className.substring(0, 50));
          } catch(e) {
            console.log('[AUTO] Failed to get like button details:', e.message);
          }

          console.log('[AUTO] Clicking like button...');
          try {
            // 获取 SVG 的父元素（P 标签）
            const parentP = await likeButton.evaluateHandle(el => {
              let p = el;
              while (p && p.tagName !== 'P') {
                p = p.parentElement;
              }
              return p;
            });

            if (parentP) {
              const pElement = parentP.asElement();
              const box = await pElement.boundingBox();
              if (box) {
                console.log('[AUTO] Clicking at position:', box.x + box.width/2, box.y + box.height/2);
                await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
                console.log('[AUTO] Liked my comment with mouse click!');
              } else {
                await pElement.evaluate(el => {
                  el.click();
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                });
                console.log('[AUTO] Liked my comment with JS click!');
              }
            } else {
              await likeButton.evaluate(el => {
                el.click();
                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              });
              console.log('[AUTO] Liked my comment with SVG click!');
            }
            // 发送反馈：已给自己评论点赞
            await sendProgressMessage(token, '👍 已给自己评论点赞', data);
          } catch(clickError) {
            console.log('[AUTO] Click failed:', clickError.message);
          }
          await new Promise(r => setTimeout(r, 1000));
        } else {
          console.log('[AUTO] Like button not found in comment');
        }
      } else {
        console.log('[AUTO] My comment not found');
      }
    } catch (e) {
      console.log('[AUTO] Like failed:', e.message);
    }

    // 截图保存
    console.log('[AUTO] Taking screenshot...');
    
    try {
      const screenshotPath = `/tmp/douyin_note_success_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log('[AUTO] Screenshot saved:', screenshotPath);
      
      // 断开浏览器连接
      await browser.disconnect();
      
      // 返回成功结果
      return { success: true, screenshotPath };
    } catch(screenshotError) {
      console.log('[AUTO] Screenshot error:', screenshotError.message);
      
      // 断开浏览器连接
      await browser.disconnect();
      return { success: false, message: '截图失败' };
    }

  } catch (e) {
    console.log('[AUTO] Error in handleDouyinNote:', e.message);
    return { commentInput: null };  // 返回对象让外部处理
  }
}

module.exports = {
  handleDouyinNote,
  inputAndSendComment
};
