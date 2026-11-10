# Browser end-to-end check (Playwright for Python). Run against a FRESH database:
#   rm -rf data && npm run build && npm start   # in one terminal
#   pip install playwright && playwright install chromium
#   python tests/e2e/browser_flow.py docs/screenshots
import sys, re
from playwright.sync_api import sync_playwright
import os, pathlib
BASE=os.environ.get('BASE_URL', 'http://localhost:3001'); OUT=sys.argv[1] if len(sys.argv) > 1 else '.'
SAMPLES=pathlib.Path(__file__).resolve().parents[2] / 'samples'
errors=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1280,'height':860})
    pg.on('console', lambda m: m.type=='error' and errors.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE); pg.screenshot(path=f'{OUT}/01-login.png')
    pg.get_by_role('button', name=re.compile('Alice Chen')).click()
    pg.get_by_text('My documents').wait_for()
    pg.get_by_role('button', name='+ New document').click()
    pg.locator('.tiptap').wait_for()
    t=pg.get_by_label('Document title'); t.fill('Launch plan'); t.press('Enter')
    ed=pg.locator('.tiptap'); ed.click()
    pg.get_by_label('Text style').select_option('h1'); pg.keyboard.type('Launch plan')
    pg.keyboard.press('Enter'); pg.keyboard.type('This is ')
    pg.keyboard.press('Control+b'); pg.keyboard.type('bold'); pg.keyboard.press('Control+b')
    pg.keyboard.type(', '); pg.keyboard.press('Control+i'); pg.keyboard.type('italic'); pg.keyboard.press('Control+i')
    pg.keyboard.type(' and '); pg.keyboard.press('Control+u'); pg.keyboard.type('underlined'); pg.keyboard.press('Control+u')
    pg.keyboard.press('Enter'); pg.get_by_title('Bulleted list').click(); pg.keyboard.type('Design review')
    pg.keyboard.press('Enter'); pg.keyboard.type('Beta rollout'); pg.keyboard.press('Enter'); pg.keyboard.press('Enter')
    pg.get_by_title('Numbered list').click(); pg.keyboard.type('First'); pg.keyboard.press('Enter'); pg.keyboard.type('Second')
    pg.get_by_text('All changes saved').wait_for(timeout=5000)
    url=pg.url; pg.reload(); pg.locator('.tiptap h1').wait_for()
    html=pg.locator('.tiptap').inner_html()
    for tag in ['<h1>','<strong>bold</strong>','<em>italic</em>','<u>underlined</u>','<ul>','<ol>']:
        assert tag in html, (tag, html)
    assert pg.get_by_label('Document title').input_value()=='Launch plan'
    pg.screenshot(path=f'{OUT}/02-editor.png'); print('persist+formatting OK')
    pg.get_by_role('button', name='Share').click()
    pg.get_by_label('Email').fill('carol@ajaia.dev'); pg.get_by_label('Role', exact=True).select_option('viewer')
    pg.locator('.share-form button').click(); pg.get_by_text('Carol Singh').wait_for()
    pg.get_by_label('Email').fill('nobody@x.com'); pg.locator('.share-form button').click()
    pg.get_by_text('No user with email').wait_for(); print('share validation OK')
    pg.get_by_label('Email').fill('')
    pg.screenshot(path=f'{OUT}/03-share.png')
    pg.get_by_role('button', name='Done').click()
    pg.get_by_title('Back to documents').click(); pg.get_by_text('My documents').wait_for()
    with pg.expect_file_chooser() as fc: pg.get_by_role('button', name='Import file…').click()
    fc.value.set_files(str(SAMPLES / 'quarterly-review.docx')); pg.locator('.tiptap h1').wait_for()
    assert '<strong>12%</strong>' in pg.locator('.tiptap').inner_html(); print('docx import OK')
    pg.get_by_title('Back to documents').click(); pg.get_by_text('quarterly-review').wait_for()
    pg.screenshot(path=f'{OUT}/04-list-alice.png')
    pg.get_by_role('button', name='Sign out').click()
    pg.get_by_role('button', name=re.compile('Carol Singh')).click(); pg.get_by_text('Shared with me').wait_for()
    pg.screenshot(path=f'{OUT}/05-list-carol.png')
    pg.get_by_text('Launch plan').click(); pg.get_by_text('You have view-only access').wait_for()
    assert pg.locator('.tiptap').get_attribute('contenteditable')=='false'
    assert pg.get_by_role('button', name='Share').count()==0
    pg.screenshot(path=f'{OUT}/06-viewer.png'); print('viewer read-only OK')
    pg.goto(BASE+'/#/doc/9999'); pg.get_by_text("Can't open this document").wait_for(); print('404 page OK')
    pg.set_viewport_size({'width':390,'height':800}); pg.goto(BASE+'/#/'); pg.get_by_text('Shared with me').wait_for()
    pg.screenshot(path=f'{OUT}/07-mobile.png')
    b.close()
print('console errors:', errors)
