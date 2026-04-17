# asterdex-npm-binance-injector
The whole point was to make "npm install binance" work with asterdex.com DEX, the main difference was in authentication and api address, so I created a injector for your robot.



# example usage:
    # npm install binance
    # npm install ethers (this is for new authentication method for DEX)

    let { deriveSignerAddress } = require('./asterdex-injector');
    let { WebsocketClient, USDMClient } = require('binance');
  
    let USER        = '0xb123167Ed4b1233879D766FcDF2f12350f196f67';
    let PRIVATE_KEY = '0x673c123c69e123b8acbafe6f82cc123b945412383d3ff5c123bf36aba12345123';
    let SIGNER      = deriveSignerAddress(PRIVATE_KEY);

    userDataStream = new WebsocketClient({ 
      user: USER, 
      signer: SIGNER, 
      privateKey: PRIVATE_KEY,
      beautify: true
    });
  
    binance_usdm_authorized = new USDMClient({
      user: USER, 
      signer: SIGNER, 
      privateKey: PRIVATE_KEY,
      recvWindow: 59000,
      disableTimeSync: true
    });

I hope that someday project "https://github.com/tiagosiebler/binance" will create a new branch called asterdex, because its super easy to do it.

Ping https://github.com/tiagosiebler 

