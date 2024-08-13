// Import Push SDK & Ethers
const { PushAPI, CONSTANTS } = require("@pushprotocol/restapi");
const { ethers } = require("ethers");
require("dotenv").config();
const express = require("express");
const app = express();
var cors = require("cors");

app.use(express.json());
app.use(cors());

const PORT = 3009;
const PKEY = `0x${process.env.CHANNEL_PRIVATE_KEY}`;
const signer = new ethers.Wallet(PKEY);
const { getNotices, getVouchers } = require("@mugen-builders/client");
const apiURL = "http://localhost:10002/graphql";
let notices = [];
let vouchers = [];

// Push channel address
const pushChannelAdress = "0x08208F5518c622a0165DBC1432Bc2c361AdFFFB1";

const getAllNotices = async () => {
  const Notices = await getNotices(apiURL);
  return Notices.map((n) => {
    let inputPayload = n?.input.payload;
    if (inputPayload) {
      try {
        inputPayload = ethers.utils.toUtf8String(inputPayload);
      } catch (e) {
        inputPayload = inputPayload + " (hex)";
      }
    } else {
      inputPayload = "(empty)";
    }
    let payload = n?.payload;
    if (payload) {
      try {
        payload = ethers.utils.toUtf8String(payload);
      } catch (e) {
        payload = payload + " (hex)";
      }
    } else {
      payload = "(empty)";
    }
    return {
      id: `${n?.id}`,
      index: parseInt(n?.index),
      payload: `${payload}`,
      input: n ? { index: n.input.index, payload: inputPayload } : {},
    };
  }).sort((b, a) => {
    if (a.input.index === b.input.index) {
      return b.index - a.index;
    } else {
      return b.input.index - a.input.index;
    }
  });
};

const getAllVouchers = async () => {
  /* const _unexVouchers = await getUnexecutedVouchers(
    provider.getSigner(),
    propos.dappAddress,
    nodeURL
  );
  console.log("unexecuted vouchers are:", _unexVouchers);
  setunexVouchers(_unexVouchers);*/
  const Vouchers = await getVouchers(apiURL);
  console.log("all vouchers are:", Vouchers);

  return Vouchers.map((n) => {
    let payload = n?.payload;
    let inputPayload = n?.input.payload;
    if (inputPayload) {
      try {
        inputPayload = ethers.utils.toUtf8String(inputPayload);
      } catch (e) {
        inputPayload = inputPayload + " (hex)";
      }
    } else {
      inputPayload = "(empty)";
    }
    if (payload) {
      const decoder = new ethers.utils.AbiCoder();
      const selector = decoder.decode(["bytes4"], payload)[0];
      payload = ethers.utils.hexDataSlice(payload, 4);
      try {
        switch (selector) {
          case "0xa9059cbb": {
            // erc20 transfer;
            const decode = decoder.decode(["address", "uint256"], payload);
            payload = `Erc20 Transfer - Amount: ${ethers.utils.formatEther(
              decode[1]
            )} - Address: ${decode[0]}`;
            break;
          }
          case "0x42842e0e": {
            //erc721 safe transfer;
            const decode = decoder.decode(
              ["address", "address", "uint256"],
              payload
            );
            payload = `Erc721 Transfer - Id: ${decode[2]} - Address: ${decode[1]}`;
            break;
          }
          case "0x522f6815": {
            //ether transfer;
            const decode2 = decoder.decode(["address", "uint256"], payload);
            payload = `Ether Transfer - Amount: ${ethers.utils.formatEther(
              decode2[1]
            )} (Native eth) - Address: ${decode2[0]}`;
            break;
          }
          case "0xf242432a": {
            //erc155 single safe transfer;
            const decode = decoder.decode(
              ["address", "address", "uint256", "uint256"],
              payload
            );
            payload = `Erc1155 Single Transfer - Id: ${decode[2]} Amount: ${decode[3]} - Address: ${decode[1]}`;
            break;
          }
          case "0x2eb2c2d6": {
            //erc155 Batch safe transfer;
            const decode = decoder.decode(
              ["address", "address", "uint256[]", "uint256[]"],
              payload
            );
            payload = `Erc1155 Batch Transfer - Ids: ${decode[2]} Amounts: ${decode[3]} - Address: ${decode[1]}`;
            break;
          }
          case "0xd0def521": {
            //erc721 mint;
            const decode = decoder.decode(["address", "string"], payload);
            payload = `Mint Erc721 - String: ${decode[1]} - Address: ${decode[0]}`;
            break;
          }
          case "0x755edd17": {
            //erc721 mintTo;
            const decode = decoder.decode(["address"], payload);
            payload = `Mint Erc721 - Address: ${decode[0]}`;
            break;
          }
          case "0x6a627842": {
            //erc721 mint;
            const decode = decoder.decode(["address"], payload);
            payload = `Mint Erc721 - Address: ${decode[0]}`;
            break;
          }
          default: {
            break;
          }
        }
      } catch (e) {
        console.log(e);
      }
    } else {
      payload = "(empty)";
    }
    return {
      id: `${n?.id}`,
      index: parseInt(n?.index),
      destination: `${n?.destination ?? ""}`,
      payload: `${payload}`,
      input: n ? { index: n.input.index, payload: inputPayload } : {},
      proof: null,
      executed: null,
    };
  }).sort((b, a) => {
    if (a.input.index === b.input.index) {
      return b.index - a.index;
    } else {
      return b.input.index - a.input.index;
    }
  });
};
let counter = 1;

const main = async () => {
  console.log("running main function", counter);
  const _notices = await getAllNotices();
  const _vouchers = await getAllVouchers();

  const userAlice = await PushAPI.initialize(signer, {
    env: CONSTANTS.ENV.STAGING,
  });

  // Subscribe to push channel
  await userAlice.notification.subscribe(
    `eip155:11155111:${pushChannelAdress}` // channel address in CAIP format
  );

  /** To-do
   * add a check to see if proofs are generated and send notifications for only those notices/vouchers which have a valid proof attached
   */

  //query cartesi-node to see if new notices are generated

  if (_notices.length > notices.length) {
    console.log("sending notification for new Notice");
    notices = _notices;
    // Send notification, provided userAlice has a channel
    const response = await userAlice.channel.send(["*"], {
      notification: {
        title: "Cartesi DApp Notification",
        body: JSON.stringify(notices[notices.length - 1]),
      },
    });
    console.log("counter is", counter, "response is", response);
  }

  //query cartesi-node to see if new notices are generated

  if (_vouchers.length > vouchers.length) {
    console.log("sending notification for new Voucher");
    vouchers = _vouchers;
    const response = await userAlice.channel.send(["*"], {
      notification: {
        title: "Cartesi DApp Notification",
        body: JSON.stringify(vouchers[vouchers.length - 1]),
      },
    });
    console.log("counter is", counter, "response is", response);
  }
  counter = counter++;
};

// Query every 5 seconds
setInterval(main, 5000);

/**
 * This code is for other functionalities
 */
// Creating a random signer from a wallet, ideally this is the wallet you will connect

// Initialize wallet user
// 'CONSTANTS.ENV.PROD' -> mainnet apps | 'CONSTANTS.ENV.STAGING' -> testnet apps
/*const main = async () => {
  const userAlice = await PushAPI.initialize(signer, {
    env: CONSTANTS.ENV.STAGING,
  });

  // List inbox notifications
  const inboxNotifications = await userAlice.notification.list("INBOX");

  // List spam notifications
  const spamNotifications = await userAlice.notification.list("SPAM");

  console.log(inboxNotifications, spamNotifications);

  // Push channel address
  const pushChannelAdress = "0x08208F5518c622a0165DBC1432Bc2c361AdFFFB1";

  // Subscribe to push channel
  await userAlice.notification.subscribe(
    `eip155:11155111:${pushChannelAdress}` // channel address in CAIP format
  );

  // Send notification, provided userAlice has a channel
  const response = await userAlice.channel.send(["*"], {
    notification: {
      title: "You awesome notification",
      body: "New notice sent 5",
    },
  });

  // To listen to real time notifications
  const stream = await userAlice.initStream([CONSTANTS.STREAM.NOTIF]);

  // Set stream event handling
  stream.on(CONSTANTS.STREAM.NOTIF, (data) => {
    console.log(data);
  });

  // Connect to stream
  stream.connect();
};
*/
/*app.post("/send-notification", async (req, res) => {
  console.log("received request", req.body);
  try {
    const userAlice = await PushAPI.initialize(signer, {
      env: CONSTANTS.ENV.STAGING,
    });

    // List inbox notifications
    const inboxNotifications = await userAlice.notification.list("INBOX");

    // List spam notifications
    const spamNotifications = await userAlice.notification.list("SPAM");

    console.log(inboxNotifications, spamNotifications);

    // Push channel address
    const pushChannelAdress = "0x08208F5518c622a0165DBC1432Bc2c361AdFFFB1";

    // Subscribe to push channel
    await userAlice.notification.subscribe(
      `eip155:11155111:${pushChannelAdress}` // channel address in CAIP format
    );
    // Send notification, provided userAlice has a channel
    const response = await userAlice.channel.send(
      ["0x4eF27B6eb11b645139596a0b5E27e4B1662b0EC5"],
      {
        notification: {
          title: "Cartesi DApp Notification",
          body: JSON.stringify(req.body.id),
        },
      }
    );
    console.log("response is", response);

    res.status(200).json({ success: true, data: JSON.stringify(response) });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

/*try {
  main();
} catch (e) {
  console.log(e);
}
*/
