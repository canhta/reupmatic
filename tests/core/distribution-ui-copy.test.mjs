import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ui = path.join(root, 'app/ui');

function read(...parts) {
  return readFileSync(path.join(ui, ...parts), 'utf8');
}

// A stored translation key is not copy: `publishErrorKey` returns a key, so the render must
// resolve it through `t()` before it reaches the DOM.
test('PostPublication translates the publish error before rendering it', () => {
  const source = read('features/distribution/PostPublication.tsx');
  assert.match(source, /\{t\(error\)\}/, 'the publish error is rendered through t()');
  assert.doesNotMatch(source, /\{error\}/, 'the raw publish error key must not be rendered');
});

// TikTok returns `privacy_level` codes. The Selector must name them through the copy map,
// never echo the code itself.
test('TikTok privacy options are translated, never the raw code', () => {
  const source = read('features/distribution/TikTokPostOptions.tsx');
  assert.match(
    source,
    /t\(tiktokPrivacyKey\(option\)\)/,
    'privacy option labels go through the copy map',
  );
  assert.doesNotMatch(source, /label:\s*option\b/, 'the raw privacy code must not be the label');
  const copy = read('features/distribution/publish-copy.ts');
  for (const code of [
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY',
  ]) {
    assert.match(copy, new RegExp(`\\b${code}:`), `${code} has a copy mapping`);
  }
});

// The saved/exported confirmations were parked in the drawer, which closed before they could
// render. They belong in the notification store, which is visible from any surface.
// The drawer rule: a body holds fields, details and lists only. PostPublication renders the
// publication status; its actions (Publish, Check status, Open post) live in the drawer footer.
test('PostPublication renders status only, never actions', () => {
  const source = read('features/distribution/PostPublication.tsx');
  assert.doesNotMatch(source, /<Button\b/, 'publication actions belong in the drawer footer');
  assert.doesNotMatch(source, /<MoreMenu\b/, 'publication actions belong in the drawer footer');
});

test('ProfileManager surfaces its confirmations through the notification store', () => {
  const source = read('features/profiles/ProfileManager.tsx');
  assert.match(source, /useNotifications\(\)/, 'ProfileManager raises notifications');
  assert.match(source, /raise\(/, 'a confirmation is raised');
  assert.doesNotMatch(source, /setMessage\(/, 'no confirmation is parked inside the drawer');
});

// The post drawer body is kit sections of fields and details; every command sits in the footer.
test('the post editor body is kit sections with no commands', () => {
  const source = read('features/distribution/PostEditor.tsx');
  const body = source.slice(
    source.indexOf('export function PostEditor('),
    source.indexOf('export function PostEditorFooter('),
  );
  assert.match(body, /<PanelSections>/, 'the body is PanelSections');
  assert.doesNotMatch(body, /<Button\b/, 'commands belong in the footer');
  assert.doesNotMatch(body, /<MoreMenu\b/, 'commands belong in the footer');
  const footer = source.slice(source.indexOf('export function PostEditorFooter('));
  assert.match(footer, /<CommandFooter\b/, 'the footer is the kit command row');
  for (const file of ['PostPlanFields.tsx', 'PostPublication.tsx']) {
    const part = read('features/distribution', file);
    assert.match(part, /<PanelSection\b/, `${file} renders a kit section`);
    assert.doesNotMatch(part, /<Button\b/, `${file} renders no command`);
  }
});

test('catalog and distribution drawers use the kit footer and rows', () => {
  for (const file of [
    'features/distribution/ChannelManager.tsx',
    'features/distribution/AffiliateManager.tsx',
    'features/profiles/ProfileManager.tsx',
    'features/taxonomy/LabelManager.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /<CommandFooter\b/, `${file} footer is a CommandFooter`);
    assert.match(source, /<PanelRows>/, `${file} body is label-left rows`);
  }
});

// TikTok's Content Sharing Guidelines (developers.tiktok.com/doc/content-sharing-guidelines) fix
// this copy: the creator nickname, the "Your brand"/"Branded content" choices and the label each
// gives the post, the consent declaration before Publish, the disabled Publish hover text, the
// branded-content privacy notice and the processing notice. TikTok publishes no Vietnamese text, so
// vi is a faithful translation. Kit rows may reshape the panel; they may not drop or reword this.
const TIKTOK_REQUIRED_COPY = {
  tiktokPostingAs: { en: 'Posting as {{name}}', vi: 'Đăng với tư cách {{name}}' },
  tiktokYourBrand: { en: 'Your brand', vi: 'Thương hiệu của bạn' },
  tiktokBrandedContent: { en: 'Branded content', vi: 'Nội dung thương hiệu' },
  tiktokDisclosurePromotional: {
    en: "Your video will be labeled as 'Promotional content'",
    vi: "Video của bạn sẽ được gắn nhãn 'Nội dung quảng bá'",
  },
  tiktokDisclosurePaid: {
    en: "Your video will be labeled as 'Paid partnership'",
    vi: "Video của bạn sẽ được gắn nhãn 'Hợp tác trả phí'",
  },
  tiktokDisclosureRequired: {
    en: 'You need to indicate if your content promotes yourself, a third party, or both.',
    vi: 'Bạn cần cho biết nội dung này quảng bá cho chính bạn, cho bên thứ ba hay cả hai.',
  },
  tiktokConsentMusic: {
    en: "By posting, you agree to TikTok's <music>Music Usage Confirmation</music>.",
    vi: 'Khi đăng, bạn đồng ý với <music>Xác nhận sử dụng nhạc</music> của TikTok.',
  },
  tiktokConsentBranded: {
    en: "By posting, you agree to TikTok's <policy>Branded Content Policy</policy> and <music>Music Usage Confirmation</music>.",
    vi: 'Khi đăng, bạn đồng ý với <policy>Chính sách nội dung thương hiệu</policy> và <music>Xác nhận sử dụng nhạc</music> của TikTok.',
  },
  tiktokPrivacyBrandedBlocked: {
    en: 'Branded content visibility cannot be set to private.',
    vi: 'Nội dung thương hiệu không thể đặt quyền xem ở chế độ riêng tư.',
  },
  tiktokProcessing: {
    en: 'It may take a few minutes for the video to process and be visible on your profile.',
    vi: 'Có thể mất vài phút để video được xử lý và hiển thị trên hồ sơ của bạn.',
  },
};

// The file that renders each required string.
const TIKTOK_COPY_OWNER = {
  tiktokPostingAs: 'TikTokPostOptions.tsx',
  tiktokYourBrand: 'TikTokPostOptions.tsx',
  tiktokBrandedContent: 'TikTokPostOptions.tsx',
  tiktokDisclosurePromotional: 'TikTokPostOptions.tsx',
  tiktokDisclosurePaid: 'TikTokPostOptions.tsx',
  tiktokDisclosureRequired: 'PostEditor.tsx',
  tiktokConsentMusic: 'TikTokPostOptions.tsx',
  tiktokConsentBranded: 'TikTokPostOptions.tsx',
  tiktokPrivacyBrandedBlocked: 'TikTokPostOptions.tsx',
  tiktokProcessing: 'PostPublication.tsx',
};

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('TikTok options keep the required compliance copy', () => {
  for (const [key, file] of Object.entries(TIKTOK_COPY_OWNER)) {
    const source = read('features/distribution', file);
    assert.match(source, new RegExp(`['"]${key}['"]`), `${key} is rendered by ${file}`);
  }
  for (const locale of ['en', 'vi']) {
    const copy = read('locales', locale, 'distribution.ts');
    for (const [key, text] of Object.entries(TIKTOK_REQUIRED_COPY)) {
      assert.match(
        copy,
        new RegExp(`${key}:\\s*['"]${escapeRegExp(text[locale])}['"],`),
        `${locale} ${key} wording`,
      );
    }
  }
});

/** One exported function of a source file, up to the next export. */
function exported(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} is exported`);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

// The Music Usage declaration shows on every TikTok post, not only while disclosure is on; with
// branded content it also names the Branded Content Policy. Both link to TikTok's own pages.
test('the TikTok consent declaration is on every post, with its policy links', () => {
  const source = read('features/distribution/TikTokPostOptions.tsx');
  const options = exported(source, 'TikTokPostOptions');
  assert.match(options, /<Trans\b/, 'the declaration is in the always-shown TikTok section');
  assert.match(options, /'tiktokConsentBranded'/, 'branded content names the policy');
  assert.match(options, /'tiktokConsentMusic'/, 'otherwise the Music Usage Confirmation');
  assert.doesNotMatch(
    exported(source, 'TikTokDisclosure'),
    /tiktokConsent/,
    'the declaration must not hide with the disclosure section',
  );
  assert.match(
    source,
    /'https:\/\/www\.tiktok\.com\/legal\/page\/global\/music-usage-confirmation\/en'/,
  );
  assert.match(source, /'https:\/\/www\.tiktok\.com\/legal\/page\/global\/bc-policy\/en'/);
});

// A disclosure with no choice disables the primary; the reason is its hover text, not body copy.
test('a missing disclosure choice is the disabled primary tooltip', () => {
  const editor = read('features/distribution/PostEditor.tsx');
  assert.match(
    exported(editor, 'PostEditorFooter'),
    /tooltip=\{[^}]*t\('tiktokDisclosureRequired'\)/,
    'the primary explains why it waits',
  );
  const options = read('features/distribution/TikTokPostOptions.tsx');
  assert.doesNotMatch(options, /tiktokDisclosureRequired/, 'no body sentence for it');
});

// Only me is disabled while branded content is on, and branded content while Only me is chosen.
test('branded content and Only me exclude each other', () => {
  const source = read('features/distribution/TikTokPostOptions.tsx');
  assert.match(
    exported(source, 'TikTokPostOptions'),
    /option === 'SELF_ONLY' && options\.brand_content_toggle/,
    'Only me is disabled for branded content',
  );
  assert.match(
    exported(source, 'TikTokDisclosure'),
    /options\.privacy_level === 'SELF_ONLY'/,
    'branded content is disabled for Only me',
  );
});

// A TikTok post previews the video it will post, Publish waits for the creator's settings, and a
// creator TikTok refuses right now is told to try again later.
test('a TikTok post previews its video and waits for creator info', () => {
  const editor = read('features/distribution/PostEditor.tsx');
  assert.match(exported(editor, 'PostEditor'), /<PostPreview\b/, 'the drawer previews the video');
  assert.match(
    exported(editor, 'PostEditorFooter'),
    /platform === 'tiktok' && creator\.settings === null/,
    'Publish waits for creator info',
  );
  const options = read('features/distribution/TikTokPostOptions.tsx');
  assert.match(options, /'tiktokCannotPost'/, 'a creator who cannot post is told to try later');
});

// The profile picker sits in the batch tray and the folder rule form: a kit row, never a wrapping
// row, with why Apply waits on its tooltip.
test('the profile picker is a kit row', () => {
  const source = read('features/profiles/ProfilePicker.tsx');
  assert.match(source, /<PanelRows>/, 'the picker is a label-left row');
  assert.doesNotMatch(source, /wrap="wrap"/, 'no wrapping row');
  assert.doesNotMatch(source, /type="supporting"/, 'no helper sentence');
  assert.match(source, /tooltip=/, 'why Apply waits is its tooltip');
});

test('TikTok options are kit rows; their retry is in the post footer menu', () => {
  const source = read('features/distribution/TikTokPostOptions.tsx');
  assert.match(source, /<PanelSection\b/, 'TikTok options are kit sections');
  assert.match(source, /<PanelRows>/, 'TikTok options are label-left rows');
  assert.match(source, /<ToggleRow\b/, 'on/off choices are ToggleRows');
  for (const part of ['Button', 'Banner', 'Switch', 'CheckboxInput']) {
    assert.doesNotMatch(source, new RegExp(`<${part}\\b`), `no ${part} in the TikTok body`);
  }
  const editor = read('features/distribution/PostEditor.tsx');
  const footer = editor.slice(editor.indexOf('export function PostEditorFooter('));
  assert.match(footer, /creator\.retry\(\)/, 'the footer menu retries loading TikTok settings');
});
