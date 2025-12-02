const puppeteer = require("puppeteer");
const log = require("log-beautify");
const readline = require("readline");

class QueueMaster {
  constructor() {
    this.bestPlace = null;
    this.queueCount = 0;
    this.activeQueues = new Set();
  }

  async createQueue(url) {
    const queueId = this.queueCount++;
    this.activeQueues.add(queueId);

    return new Promise(async (resolve, reject) => {
      let browser = null;
      let page = null;

      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox"],
        });
        page = await browser.newPage();

        browser.on("disconnected", () => {
          reject(new Error("Browser was closed manually"));
        });

        await page.goto(url);

        try {
          await page.waitForSelector(".erreurback", { timeout: 1000 });
          reject(new Error("Error page detected"));
          return;
        } catch {
        }

        await page.waitForSelector("#MainPart_lbUsersInLineAheadOfYou", {
          timeout: false,
          visible: true,
        });

        const result = await page.evaluate(() => {
          const positionElement = document.querySelector(
            "#MainPart_lbUsersInLineAheadOfYou"
          );
          const idElement = document.querySelector("#hlLinkToQueueTicket2");

          if (!positionElement || !idElement) {
            return null;
          }

          return {
            position: parseInt(positionElement.innerHTML),
            id: idElement.innerHTML,
          };
        });

        if (!result || !result.position || !result.id) {
          reject(new Error("Required selectors not found"));
          return;
        }

        const currentUrl = new URL(page.url());
        resolve({
          ...result,
          url: `${currentUrl.origin}/?c=${currentUrl.searchParams.get(
            "c"
          )}&e=${currentUrl.searchParams.get("e")}&q=${result.id}`,
        });
      } catch (error) {
        reject(error);
      } finally {
        this.activeQueues.delete(queueId);
        try {
          if (browser && browser.isConnected()) {
            await browser.close();
          }
        } catch {
        }
      }
    });
  }

  handleQueueResult(queueId, queue) {
    if (!this.bestPlace) {
      log.show("\n");
      this.bestPlace = queue.position;
    }

    if (queue.position < this.bestPlace) {
      this.bestPlace = queue.position;
      log.success(
        `Better place found! (Queue #${queueId}) - Position: ${queue.position} => ${queue.url}`
      );
    } else {
      log.show(
        `New place found (Queue #${queueId}) - Position: ${queue.position} => ${queue.url}`
      );
    }
  }

  handleQueueError(queueId, error) {
    log.warning(`Queue #${queueId} failed: ${error.message}`);
  }

  async spawnQueue(url) {
    const queueId = this.queueCount;

    this.createQueue(url)
      .then((queue) => {
        this.handleQueueResult(queueId, queue);
      })
      .catch((error) => {
        this.handleQueueError(queueId, error);
      });
  }

  async start(url) {
    log.info("QueueMaster started. Press Enter to create a new queue.");
    log.info(`Current best place: ${this.bestPlace || "N/A"}`);
    log.info(`Active queues: ${this.activeQueues.size}`);
  }
}

async function main() {
  log.info(
    "This script only works for events protected by queue-it, like ticketmaster"
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    const url =
      (await question("Enter the event URL: ")) ||
      "https://www.ticketmaster.fr/fr/manifestation/the-weeknd-billet/idmanif/541693";

    log.info(`Using URL: ${url}\n`);

    const queueMaster = new QueueMaster();
    await queueMaster.start(url);

    while (true) {
      await question("Press Enter to create a new queue (or Ctrl+C to exit): ");
      await queueMaster.spawnQueue(url);
      log.info(
        `Queue #${queueMaster.queueCount - 1} spawned`
      );
    }
  } catch (error) {
    if (error.code === "SIGINT" || error.message.includes("SIGINT")) {
      log.info("\nExiting...");
      process.exit(0);
    }
    log.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

main();
