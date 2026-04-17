# asterdex-npm-binance-injector
The whole point was to make "npm install binance" work with asterdex.com DEX, the main difference was in authentication and api address, so I created a injector for your robot.



# example usage:
    # npm install binance
    # npm install ethers (this is for new authentication method for DEX)

    let { deriveSignerAddress } = require('./asterdex-injector');
    let { WebsocketClient, USDMClient } = require('binance');

    # Pro API keys are generated here for free https://www.asterdex.com/en/api-wallet
    # just login with your wallet, I used a Brave wallet

    // this is your wallet address
    let USER        = '0xb123167Ed4b1233879D766FcDF2f12350f196f67';

    // this is from website
    let PRIVATE_KEY = '0x673c123c69e123b8acbafe6f82cc123b945412383d3ff5c123bf36aba12345123';

    // this done by ethers npm
    let SIGNER      = deriveSignerAddress(PRIVATE_KEY); 

    // new authentication method because DEX
    userDataStream = new WebsocketClient({ 
      user: USER, 
      signer: SIGNER, 
      privateKey: PRIVATE_KEY,
      beautify: true
    });

    // new authentication method because DEX
    binance_usdm_authorized = new USDMClient({
      user: USER, 
      signer: SIGNER, 
      privateKey: PRIVATE_KEY,
      recvWindow: 59000,
      disableTimeSync: true
    });

    // all other your functions stay the same, like that:
    await binance_usdm_authorized.submitNewOrder({
        newClientOrderId: 'x-15PC4ZJy-sl-0-0-mo2ax1eq',
        positionSide: 'BOTH',
        priceProtect: 'TRUE',
        side: 'SELL',
        stopPrice: 0.09699,
        symbol: 'DOGEUSDT',
        timeInForce: 'GTC',
        type: 'STOP_MARKET',
        closePosition: 'true',
        newOrderRespType: 'RESULT'
    })

what is missing in v3 api on asterdex: Orders over WebSocket API, AlgoOrders (so had to revert back to rest api in my bot)

I hope that someday project "https://github.com/tiagosiebler/binance" will create a new branch called asterdex, because its super easy to do it.

Ping https://github.com/tiagosiebler 

