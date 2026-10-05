import hre from "hardhat";

const factory = await hre.ethers.getContractFactory("IdentityManagement");
const contract = await factory.deploy();
await contract.waitForDeployment();

console.log("IdentityManagement deployed to", await contract.getAddress());
