// dev/folium/sample-home-tab/client.mjs
// Offline home-page demo: no network or private account required.

export default function activate(folium) {
  if (folium.host.folium.minor < 5) throw new Error('This sample requires Folium 1.5 homeTabs.');
  let handle = null;
  let draft = '';
  let mounts = 0;
  let cleanups = 0;
  const register = () => {
    if (handle) return;
    handle = folium.registries.homeTabs.register({
      id: 'notes', order: 200,
      label: { 'zh-CN': '首页示例', en: 'Home demo' },
      mount(container, ctx) {
        const zh = ctx.locale.startsWith('zh');
        mounts++;
        folium.log.info('Home demo mounted', { mounts, cleanups });
        const style = document.createElement('style');
        style.textContent = `
          * { box-sizing: border-box; }
          .demo { display: grid; grid-template-columns: min(230px, 30%) 1fr; gap: 24px; padding: 24px; height: 100%; font: 14px/1.6 var(--folium-font, sans-serif); }
          aside { border-right: 1px solid color-mix(in srgb, currentColor 20%, transparent); padding-right: 20px; }
          h2 { margin-top: 0; }
          main { display: flex; min-width: 0; min-height: 0; flex-direction: column; gap: 16px; }
          textarea { flex: 1; min-height: 180px; width: 100%; resize: none; border-radius: 16px; padding: 16px; color: inherit; font: inherit; background: color-mix(in srgb, currentColor 5%, transparent); border: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
          button { align-self: flex-start; border: 1px solid currentColor; border-radius: 999px; padding: 8px 16px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
        `;
        const root = document.createElement('div'); root.className = 'demo';
        const aside = document.createElement('aside');
        const title = document.createElement('h2'); title.textContent = zh ? '完整首页页面' : 'Full home page';
        const help = document.createElement('p'); help.textContent = zh
          ? '这里没有联网。输入文字、回车、Tab，然后返回书库。宿主搜索不应接管输入。'
          : 'This demo is offline. Type, press Enter and Tab, then return to the library. Host search must leave input alone.';
        const count = document.createElement('p'); count.textContent = `${zh ? '挂载 / 清理' : 'Mounts / cleanups'}: ${mounts} / ${cleanups}`;
        aside.append(title, help, count);
        const main = document.createElement('main');
        const input = document.createElement('textarea'); input.value = draft;
        input.setAttribute('aria-label', zh ? '测试输入' : 'Test input');
        input.addEventListener('input', () => { draft = input.value; });
        const remove = document.createElement('button'); remove.textContent = zh ? '移除页面入口' : 'Remove page entry';
        remove.onclick = () => { handle?.unregister(); handle = null; };
        const instructions = document.createElement('p'); instructions.textContent = zh
          ? '移除后应返回原生首页。在命令面板运行“打开首页示例”可以重新注册。禁用模组将清理页面和命令。'
          : 'Removal returns to the native home. Run “Open home demo” in the command palette to register it again. Disabling the mod removes the page and command.';
        main.append(input, remove, instructions);
        root.append(aside, main); container.append(style, root);
        return () => { cleanups++; folium.log.info('Home demo cleaned up', { mounts, cleanups }); };
      },
    });
  };
  register();
  const command = folium.registries.commands.register({
    id: 'open', label: { 'zh-CN': '打开首页示例', en: 'Open home demo' }, icon: 'notebook',
    run: () => { register(); folium.ui.openHomeTab('notes'); },
  });
  return () => { handle?.unregister(); handle = null; command.unregister(); };
}
