const puppeteer = require("puppeteer");
const log = require("log-beautify");
var prompt = require("prompt");

async function start(instances, url, debug) {
  let bestPlace = null;
  let consumed = 0;
  for (let i = 0; i < instances; i++) {
    createQueue(url, debug)
      .then((queue) => {
        if (!bestPlace) {
          log.show("\n");
          bestPlace = queue.position;
        }
        if (queue.position < bestPlace) {
          bestPlace = queue.position;
          log.success(
            `Better place found! (${i}) - ${queue.position} => ${queue.url}`
          );
        } else {
          log.show(
            `New place found (${i}) - ${queue.position} => ${queue.url}`
          );
        }
      })
      .catch(() => {
        log.warning(`Queue ${i} failed`);
      })
      .finally(async () => {
        consumed += 1;
        if (instances === consumed) {
          log.info(`Over ! The best place is ${bestPlace}`);
          await prompt.get("press enter to exit");
        }
      });
  }

  log.info(`Started ${instances} queues`);
}

async function createQueue(url, debug) {
  return new Promise(async (resolve, reject) => {
    const browser = await puppeteer.launch({ headless: debug ? false : true });
    const page = await browser.newPage();

    await page.goto(url);

    await page
      .waitForSelector(".erreurback", { timeout: 1000 })
      .then(() => {
        reject();
      })
      .catch(async () => {
        await page.waitForSelector("#MainPart_lbUsersInLineAheadOfYou", {
          timeout: false,
          visible: true,
        });

        const res = await page.evaluate(() => {
          return {
            position: parseInt(
              document.querySelector("#MainPart_lbUsersInLineAheadOfYou")
                .innerHTML
            ),
            id: document.querySelector("#hlLinkToQueueTicket2").innerHTML,
          };
        });
        const url = new URL(page.url());
        resolve({
          ...res,
          url: `${url.origin}/?c=${url.searchParams.get(
            "c"
          )}&e=${url.searchParams.get("e")}&q=${res.id}`,
        });
      });

    await browser.close();
  });
}
log.info(
  `This script only works for events protected by queue-it, like ticketmaster`
);

prompt.start({
  message: " ",
  delimiter: " ",
});
prompt
  .get([
    {
      name: "debug",
      message: "Set the debug mode (skip to ignore)",
    },
    {
      name: "queues",
      message: "How many queue to you want to create ?",
      validator: /^[0-9\s-]+$/,
      type: "number",
      default: 10,
      required: true,
      warning: "You need to enter a number",
    },
    {
      name: "url",
      message:
        "URL of the event",
      default:
        "https://www.ticketmaster.fr/fr/manifestation/the-weeknd-billet/idmanif/541693",
      required: true,
    },
  ])
  .then(async (res) => {
    start(res.queues, res.url, res.debug);
  });
