import dappeteer from '@chainsafe/dappeteer';
import { ethers } from "ethers";
import fs from 'fs';
import yaml from 'js-yaml';
import jwt_decode from "jwt-decode";
import dotenv from 'dotenv';
dotenv.config();

const url = 'https://blur.io/collection/ailoverse-cats/bids';
const bidsURL = 'https://core-api.prod.blur.io/v1/collections/ailoverse-cats/executable-bids';
const connectionsURL = 'https://blur.io/collections';

(async () => {
    cleanupCookies()
    const isOwnerMode = isOwner();
    // depending from script param create random wallet or use mnemonic from env
    const wallet = isOwnerMode ? new ethers.Wallet(process.env.PK) : ethers.Wallet.createRandom();

    let launchOptions = {
        password: "IpakgABrNGuqMKCIucArDNho90m",
        headless: false,
    }
    if (isOwnerMode) {
        console.log("use account: ", wallet.address)
    } else {
        console.log('mnemonic:', wallet.mnemonic.phrase)
        launchOptions.seed = wallet.mnemonic.phrase;
    }

    const { metaMask, browser } = await dappeteer.bootstrap(
        {
           // seed: wallet.mnemonic.phrase,
            password: "IpakgABrNGuqMKCIucArDNho90m",
            headless: false,
        }
    );
    if (isOwnerMode) {
        await metaMask.importPK(wallet.privateKey)
    }
    let connectIterations = 0;
    browser.getSource().on('targetcreated', async (target) => {
        console.log("target created")
        const tPage = await target.page();
        if (!tPage) return;
        const title = await tPage.title();
        console.log("title: ", title)
        if (title !== 'MetaMask Notification') return;
        try {
            const titleItem = await tPage.waitForSelector(".permissions-connect-header__title", { timeout: 3000 })
            const title = await titleItem.evaluate(el => el.textContent)
            if (title === 'Connect with MetaMask') {
                console.log("Connect with MetaMask")
                const button = await tPage.waitForSelector("button.button.btn-primary");
                if (button) await button.click();

                const connectButton = await tPage.waitForSelector("button.button.btn-primary");
                if (connectButton) await connectButton.click();
                connectIterations++;
            }
        } catch (error) {
            console.log("Signature request message")
            const connectButton = await tPage.waitForSelector("button.button.btn-primary", { timeout: 3000 });
            if (connectButton) await connectButton.click();
            connectIterations++;
        }
    });
    setTimeout(async () => {
        console.log("timeout, close browser");
        await browser.close();
        process.exit()
    }, 60000);

    console.log("create a new page and visit blur");
    const blurPage = await browser.newPage();
    await blurPage.setViewport({ width: 1366, height: 768});
    await blurPage.getSource().setRequestInterception(true);
    blurPage.getSource().on('request', blurInterceptor);
    await blurPage.goto(url,{waitUntil: 'load'});

    console.log("connect MetaMask to blur");
    await (await blurPage.waitForSelector('text/connect wallet')).click();
    await (await blurPage.waitForSelector('#METAMASK')).click();
    console.log("connect clicked");

    function waitForChange() {
        return new Promise(resolve => {
            setInterval(() => {
                if (connectIterations >= 2) {
                    // wait until the page is loaded
                    setTimeout(() => {
                        resolve();
                    }, 3000);
                }
            }, 1000);
        });
    }
    await waitForChange();

    const response = await blurPage.getSource().goto(bidsURL, { waitUntil: 'load' });
    const responseStatus = response.status();
    if (responseStatus !== 200) {
        console.log("Error: ", responseStatus);
        return;
    }
    console.log("account connected, extract cookies")
    const cookies = await blurPage.getSource().cookies();
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    isOwnerMode ? saveOwnerCookie(cookieString) : saveNewCookie(cookieString);
    console.log("cookies extracted, close browser")
    if (isVolumeScrapping()) {
        console.log("start scrapping volumes")
        const data = new Map();
        // scrap main page for volumes
        await blurPage.goto(connectionsURL, { waitUntil: 'load' });
        await waitForChange();
        let headers = [];
        try {
            for (let j = 0; j < 1000; j++) {
                if (j > 0) {
                    // scroll mouse to load more items
                    await blurPage.getSource().mouse.wheel({ deltaY: 1000 });
                }
                const items = await blurPage.$$("a.row");
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const href = await item.getSource().evaluate(el => el.href);
                    const childs = await item.getSource().$$(':scope > div.cell')
                    const collectionInfo = {
                        link: href,
                        name: await childs[0].evaluate(el => el.textContent),
                        floor_price: await childs[1].evaluate(el => el.textContent),
                        top_bid: await childs[2].evaluate(el => el.textContent),
                        day_change: await childs[3].evaluate(el => el.textContent),
                        week_change: await childs[4].evaluate(el => el.textContent),
                        volume: await childs[5].evaluate(el => el.textContent),
                        day_volume: await childs[6].evaluate(el => el.textContent),
                        week_volume: await childs[7].evaluate(el => el.textContent),
                        owners: await childs[8].evaluate(el => el.textContent),
                        supply: await childs[9].evaluate(el => el.textContent),
                        total_bid_value: "",
                    }
                    data.set(href, collectionInfo)
                    if (headers.length === 0) {
                        headers.push(Object.keys(collectionInfo).join(';'));
                    }
                    console.log(`item ${i} processed: ${collectionInfo.name}`)
                }
                console.log(`page ${j} processed, wait for change`)
               // await waitForChange();
            }
            // fill total_bid_value
            for (const [key, value] of data.entries()) {
                await blurPage.goto(key + `/bids`, { waitUntil: 'load' });
                await waitForChange();
                const totalBidValue = await blurPage.$eval("div.section-header div.sc-jRQBWg.fLhnyg", el => el.textContent);
                value.total_bid_value = totalBidValue;
                console.log(`total bid value for ${value.name} is ${totalBidValue}`)
            }
            if (data.size > 0) {
                console.log("save data to csv file")
                let csvRows = [];
                csvRows.push(headers.join(';'));
                for (const [key, value] of data.entries()) {
                    csvRows.push(Object.values(value).join(';'));
                }
                fs.writeFileSync('volumes.csv', csvRows.join('\n'));
            }
        }
        catch (error) {
            console.log("failed to scrap table", error)
        }
    }
    await browser.close();
    process.exit()
})();

function blurInterceptor(interceptedRequest) {
    if (interceptedRequest.isInterceptResolutionHandled()) return;
    const url = interceptedRequest.url();
    const isOwnerMode = isOwner();
    const skip = url.startsWith('https://images.blur.io') ||
        url.startsWith('https://rdr.blurio.workers.dev') ||
        url.startsWith('https://vitals.vercel-insights.com') ||
        url.endsWith('.otf') ||
        url.endsWith('.png');
    !isOwnerMode && skip ? interceptedRequest.abort() : interceptedRequest.continue();
}

function saveNewCookie(cookieStr) {
    const doc = yaml.load(fs.readFileSync('cookies.yml', 'utf8'));
    doc.cookies.push(cookieStr);
    saveYml(doc);
}

function saveOwnerCookie(cookieStr) {
    const doc = yaml.load(fs.readFileSync('cookies.yml', 'utf8'));
    doc.owner = cookieStr;
    saveYml(doc);
}

function cleanupCookies() {
    const doc = yaml.load(fs.readFileSync('cookies.yml', 'utf8'));
    let resultCookie = [];
    for (let cookie of doc.cookies) {
        try {
            const cookieList = cookie.split(';');
            let authCookie = ""
            for (let i = 0; i < cookieList.length; i++) {
                if (cookieList[i].includes("authToken")) {
                    authCookie = cookieList[i];
                    break;
                }
            }

            const decoded = jwt_decode(authCookie);
            if (decoded.exp > (Date.now() / 1000) + (3 * 86400)) { // 3 days from now
                resultCookie.push(cookie);
            }
        } catch (e) {
            console.log("failed to parse cookie", cookie)
        }
    }
    doc.cookies = resultCookie;
    saveYml(doc);
    console.log("cookie filtered")
}

function saveYml(doc) {
    fs.writeFileSync('cookies.yml', yaml.dump(doc, {
        styles: {
            '!!null': 'canonical', // dump null as ~
            '!!str': 'single',
            '!!seq': 'block',
        },
        lineWidth: -1,          // set to -1 to disable line wrapping
        quotingType: '"',
        forceQuotes: true,
    }));
}

function isOwner() {
    const args= process.argv.slice(2);
    return args.length > 0 && args[0] === 'owner';
}

function isVolumeScrapping() {
    const args= process.argv.slice(2);
    return args.length > 0 && args[0] === 'volume';
}