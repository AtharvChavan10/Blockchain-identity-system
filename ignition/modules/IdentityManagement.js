import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("IdentityManagementModule", (m) => {
  const identity = m.contract("IdentityManagement");
  return { identity };
});
