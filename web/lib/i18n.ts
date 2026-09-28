export const locales = ['en', 'vi'] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const messages = {
  en: {
    meta: {
      title: 'Reupmatic — Batch video prep for Douyin reuploads',
      description:
        'Gather Douyin links, subtitle and dub a whole batch in Vietnamese, on your own machine. Keep the affiliate link with each post.',
    },
    nav: {
      alpha: 'What is this?',
      support: 'Need help?',
      download: 'Download free',
      language: 'Language',
      home: 'Reupmatic home',
      primaryNavigation: 'Primary navigation',
      skip: 'Skip to main content',
    },
    hero: {
      status: 'Free to try',
      title: 'Sub, dub and post a whole batch in one go.',
      body: 'It pulls Douyin videos, subtitles and dubs them in Vietnamese, and exports on your machine.',
      cta: 'Download free',
      note: 'Out for macOS and Windows.',
    },
    stage: {
      label: 'A Reupmatic batch moving from Douyin links to exports on your machine',
      title: 'A batch running',
      source: 'Videos added',
      processing: 'Reupmatic is working',
      output: 'On your machine',
      downloaded: 'Downloaded',
      ready: 'Done',
      current: 'Making voice',
      queued: 'Waiting',
      tasks: ['Downloaded from Douyin', 'Vietnamese subtitles done', 'Making Vietnamese voice'],
      files: ['desk-lamp-07.mp4', 'kitchen-rack-12.mp4', 'storage-box-04.mp4'],
      summary: '2 done, 1 running',
      local: 'Saved on this machine',
    },
    value: {
      title: 'You pick the videos. The grunt work is on the app.',
      body: 'No opening every file and repeating the same steps.',
      items: [
        [
          'Throw in a whole batch',
          'Paste Douyin links or pick files you already have. It lines them all up and works through them.',
        ],
        [
          'Get a Vietnamese version',
          'It subtitles, translates and dubs. You check it, then export.',
        ],
        [
          'See where each video is',
          'One place shows what is done, what is running, what needs another look.',
        ],
        [
          'Pin the right product link',
          'Attach the affiliate link to each draft, so posting is not a hunt for the right one.',
        ],
      ],
    },
    alpha: {
      title: 'What the hell is it?',
      body: 'A few little tools I hacked together so my wife can pull Shopee affiliate links automatically. Hope it helps you too.',
      now: 'Sort of working already',
      nowItems: [
        'Pick and download videos from Douyin',
        'Edit, subtitle, translate and voice them on your machine',
        'Queue up a bunch of videos, done one after another',
        'Save affiliate links and post drafts on your machine',
      ],
      next: 'Still vibe-coding away over here',
      nextItems: [
        'Post straight to YouTube and Facebook',
        'Add TikTok to the list',
        'Let the app run itself on a schedule',
      ],
      note: 'It cannot post to your channels yet. For now it saves posts as drafts on your machine.',
    },
    faq: {
      title: 'Still not sure what it is?',
      body: 'A few things worth knowing before you install.',
      items: [
        [
          'Does it post to YouTube, Facebook or TikTok yet?',
          'No. It saves the channel, affiliate link and time as a draft. Direct posting is still being built.',
        ],
        [
          'Is the Alpha free?',
          'Yes. It is free right now. Pricing after Alpha is not settled; I will say so before it changes.',
        ],
        [
          'Can it download every Douyin video?',
          'No. Only videos your Douyin account can watch. Some still get blocked, depending on your account and network.',
        ],
        [
          'Does it create Shopee affiliate links for me?',
          'No. You still grab the link and paste it into the draft. The app just keeps it with the right video.',
        ],
        [
          'Are my videos uploaded anywhere?',
          'The main steps run on your machine. If something needs to go online, the app asks first.',
        ],
        [
          'Does text and watermark removal always come out clean?',
          'Depends on the video. Busy backgrounds or lots of moving text leave marks. Check before you export.',
        ],
        [
          'Can I reup any video I find?',
          'No. Only use videos you own or have permission to edit and repost. The app does not grant usage rights or promise monetisation.',
        ],
      ],
    },
    download: {
      title: 'Download it, try a few links.',
      body: 'It is free right now. Try a few videos and tell me where it trips you up.',
      mac: 'Download for macOS',
      windows: 'Download for Windows',
      macNote: 'Latest Alpha build',
      windowsNote: 'Latest Alpha build',
      note: 'Only use videos you own or have permission to edit and repost.',
    },
    contact: {
      title: 'Need a hand? Message me.',
      body: 'Want a new feature, or think an old one is dumb? Come yell at me and I will upgrade it.',
      zalo: 'Join the Zalo group',
      email: 'Email me',
      emailSubject: 'Reupmatic Alpha feedback',
    },
    footer: {
      maker: 'Cảnh Tạ',
    },
  },
  vi: {
    meta: {
      title: 'Reupmatic — Làm cả loạt video reup ngay trên máy',
      description:
        'Gom link Douyin, làm phụ đề với giọng Việt, giữ link affiliate cho cả loạt video trên máy.',
    },
    nav: {
      alpha: 'Cái gì đây?',
      support: 'Cần hỗ trợ?',
      download: 'Tải về miễn phí',
      language: 'Ngôn ngữ',
      home: 'Trang chủ Reupmatic',
      primaryNavigation: 'Điều hướng chính',
      skip: 'Đi thẳng tới nội dung chính',
    },
    hero: {
      status: 'Dùng thử miễn phí',
      title: 'Việt hoá cả loạt video, lên bài một lượt.',
      body: 'Tự tải video Douyin, làm phụ đề, lồng giọng Việt, xuất ngay trên máy.',
      cta: 'Tải về miễn phí',
      note: 'Có bản cho macOS và Windows.',
    },
    stage: {
      label: 'Một loạt video đang đi từ link Douyin tới bản xuất trên máy trong Reupmatic',
      title: 'Một loạt đang chạy',
      source: 'Video đã thêm',
      processing: 'Reupmatic đang làm',
      output: 'Video trên máy',
      downloaded: 'Đã tải',
      ready: 'Đã xong',
      current: 'Đang tạo giọng',
      queued: 'Đang chờ',
      tasks: ['Đã tải từ Douyin', 'Phụ đề Việt đã xong', 'Đang tạo giọng Việt'],
      files: ['den-ban-07.mp4', 'ke-bep-12.mp4', 'hop-do-04.mp4'],
      summary: '2 video đã xong, 1 video đang chạy',
      local: 'Đã lưu trên máy này',
    },
    value: {
      title: 'Các bác chọn video. Việc tay chân để app làm.',
      body: 'Khỏi mở từng file rồi lặp lại một đống thao tác.',
      items: [
        [
          'Ném cả loạt link vào',
          'Dán link Douyin hoặc chọn video có sẵn. App xếp hết vào một chỗ, làm lần lượt.',
        ],
        ['Ra bản tiếng Việt', 'App làm phụ đề, dịch với lồng giọng. Các bác xem lại rồi xuất.'],
        [
          'Biết video nào đang tới đâu',
          'Nhìn một chỗ là biết video nào xong, video nào đang chạy, video nào cần xem lại.',
        ],
        [
          'Ghim đúng link bán hàng',
          'Gắn link affiliate vào từng bài nháp, lúc đăng khỏi lục lại hay gắn nhầm.',
        ],
      ],
    },
    alpha: {
      title: 'Nó là cái đ* gì?',
      body: 'Có vài cái tiện ích vui vui cho con vợ em nó kiếm affiliate tự động từ Shopee, mong nó giúp được các bác.',
      now: 'Dùng cũng tạm tạm rồi',
      nowItems: [
        'Chọn và tải video từ Douyin',
        'Chỉnh video, phụ đề, dịch với tạo giọng trên máy',
        'Cho nhiều video xếp hàng chờ, làm lần lượt',
        'Lưu link affiliate và bài nháp trên máy',
      ],
      next: 'Em vẫn đang Vibe code tiếp các bác ạ',
      nextItems: [
        'Đăng thẳng lên YouTube và Facebook',
        'Thêm TikTok vào danh sách kênh',
        'Cho app tự chạy theo lịch',
      ],
      note: 'Chưa tự đăng lên kênh được. App mới lưu bài thành nháp trên máy.',
    },
    faq: {
      title: 'Vẫn chưa rõ nó là cái gì?',
      body: 'Mấy chuyện các bác nên biết trước khi dùng.',
      items: [
        [
          'Đã tự đăng lên YouTube, Facebook, TikTok chưa?',
          'Chưa. App mới lưu kênh, link affiliate với giờ đăng thành nháp. Đăng thẳng em vẫn đang làm.',
        ],
        [
          'Bản Alpha có thu phí không?',
          'Không. Đang miễn phí. Giá sau Alpha em chưa chốt, đổi thì em báo trước.',
        ],
        [
          'Tải được mọi video Douyin à?',
          'Không. Chỉ tải được video mà tài khoản Douyin của các bác xem được. Vài video vẫn bị chặn, tuỳ tài khoản với mạng.',
        ],
        [
          'App có tự tạo link Shopee không?',
          'Chưa. Link affiliate các bác vẫn tự lấy rồi dán vào bài nháp. App giữ link đó đi cùng video.',
        ],
        [
          'Video có bị tải lên server không?',
          'Mấy bước chính chạy hết trên máy. Cần gửi gì ra ngoài, app sẽ hỏi trước.',
        ],
        [
          'Xoá chữ, watermark có sạch không?',
          'Tuỳ video. Nền rối hoặc chữ chạy nhiều thì dễ lộ vết. Xem lại trước khi xuất.',
        ],
        [
          'Lấy video nào về reup cũng được à?',
          'Không. Chỉ dùng video các bác có hoặc được phép sửa với đăng lại. App không cấp quyền dùng video, cũng không hứa bật kiếm tiền.',
        ],
      ],
    },
    download: {
      title: 'Tải về, thử vài link là biết.',
      body: 'Đang miễn phí. Các bác thử vài video, vướng đâu vào nhóm báo em.',
      mac: 'Tải cho macOS',
      windows: 'Tải cho Windows',
      macNote: 'Bản Alpha mới nhất',
      windowsNote: 'Bản Alpha mới nhất',
      note: 'Chỉ dùng video các bác có hoặc được phép sửa với đăng lại thôi nhé.',
    },
    contact: {
      title: 'Cần hỗ trợ gì các bác nhắn em',
      body: 'Cần tính năng mới hay tính năng cũ ngu quá, bác chửi thẳng mặt em rồi em nâng cấp.',
      zalo: 'Vào nhóm Zalo',
      email: 'Gửi email cho em',
      emailSubject: 'Góp ý Reupmatic Alpha',
    },
    footer: {
      maker: 'Cảnh Tạ',
    },
  },
} as const;
