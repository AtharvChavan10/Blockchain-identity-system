import { expect } from "chai";
import hre from "hardhat";

describe("IdentityManagement", function () {
  async function deploy() {
    const [admin, user, stranger] = await hre.ethers.getSigners();
    const Factory = await hre.ethers.getContractFactory("IdentityManagement");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    return { contract, admin, user, stranger };
  }

  it("registers an identity for the caller", async function () {
    const { contract, user } = await deploy();
    await contract.connect(user).registerIdentity("Ada Lovelace", "ada@identra.dev", "doc-hash");

    const id = await contract.getIdentity(user.address);
    expect(id.name).to.equal("Ada Lovelace");
    expect(id.email).to.equal("ada@identra.dev");
    expect(id.docHash).to.equal("doc-hash");
    expect(id.isVerified).to.equal(false);
    expect(id.owner).to.equal(user.address);
    expect(id.exists).to.equal(true);
  });

  it("rejects a second registration", async function () {
    const { contract, user } = await deploy();
    await contract.connect(user).registerIdentity("Ada", "ada@identra.dev", "doc-hash");
    await expect(
      contract.connect(user).registerIdentity("Ada", "ada@identra.dev", "doc-hash")
    ).to.be.revertedWith("Already registered");
  });

  it("lets only the admin verify", async function () {
    const { contract, admin, user } = await deploy();
    await contract.connect(user).registerIdentity("Ada", "ada@identra.dev", "doc-hash");
    await expect(contract.connect(user).verifyIdentity(user.address)).to.be.revertedWith("Not admin");

    await contract.connect(admin).verifyIdentity(user.address);
    const id = await contract.getIdentity(user.address);
    expect(id.isVerified).to.equal(true);
  });

  it("clears verification when the document hash changes", async function () {
    const { contract, admin, user } = await deploy();
    await contract.connect(user).registerIdentity("Ada", "ada@identra.dev", "doc-hash");
    await contract.connect(admin).verifyIdentity(user.address);

    await contract.connect(user).updateProfile("Ada Lovelace", "ada@identra.dev", "doc-hash");
    let id = await contract.getIdentity(user.address);
    expect(id.isVerified).to.equal(true);
    expect(id.name).to.equal("Ada Lovelace");

    await contract.connect(user).updateProfile("Ada Lovelace", "ada@identra.dev", "new-hash");
    id = await contract.getIdentity(user.address);
    expect(id.docHash).to.equal("new-hash");
    expect(id.isVerified).to.equal(false);
  });

  it("lets the owner or admin revoke, and only the admin remove", async function () {
    const { contract, admin, user, stranger } = await deploy();
    await contract.connect(user).registerIdentity("Ada", "ada@identra.dev", "doc-hash");
    await contract.connect(admin).verifyIdentity(user.address);

    await expect(contract.connect(stranger).revokeIdentity(user.address)).to.be.revertedWith("Not allowed");
    await contract.connect(user).revokeIdentity(user.address);
    expect((await contract.getIdentity(user.address)).isVerified).to.equal(false);

    await expect(contract.connect(user).removeIdentity(user.address)).to.be.revertedWith("Not admin");
    await contract.connect(admin).removeIdentity(user.address);
    expect((await contract.getIdentity(user.address)).exists).to.equal(false);
  });
});
