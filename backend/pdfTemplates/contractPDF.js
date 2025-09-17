const React = require("react");
const { Page, Text, View, Document, StyleSheet, Font } = require("@react-pdf/renderer");
const path = require("path");
const crypto = require("crypto");
const AdvanceContractPDF = require("./advanceContractPDF.js");
const RegularContractPDF = require("./regularContractPDF.js");


function boldedCompanyName(buyer){
  return React.createElement(Text, { style: { fontWeight: "bold" } }, `${buyer.name} с ЕИК: `);
}

function boldedClientName(buyer){
  return React.createElement(Text, { style: { fontWeight: "bold" } }, `${buyer.first_name} ${buyer.middle_name} ${buyer.last_name}, с ЕГН: ${decryptUCN}`);
}

function boldText(text){
  return React.createElement(Text, { style: { fontWeight: "bold" } }, text);
}

function ContractPDF({ buyer, cars = [], contract_type, advance_amount, type }) {
    if(contract_type === "advance") {
        return React.createElement(AdvanceContractPDF, { buyer, cars, advance_amount, type });
    }else if(contract_type === "regular") {
        return React.createElement(RegularContractPDF, { buyer, cars, type });
    } else {
        throw new Error("Unknown contract type");
    }
}

module.exports = ContractPDF;
