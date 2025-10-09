// import { useState } from "react";
// import { useData } from "../hooks/useData";
// import { createOffer, sendOfferEmail } from "../services/api";

// export default function OfferForm({ selectedCars, adminId, adminFirstname, adminLastname, fetchOffers }) {
//   const { clients, setClients, companies, setCompanies } = useData();
  
//   const [selectedBuyer, setSelectedBuyer] = useState({ type: "", buyer: null });
//   const [pdfLink, setPdfLink] = useState("");
//   const [offerId, setOfferId] = useState("");

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     const carIds = selectedCars.map((c) => c.id);
//     console.log(selectedBuyer.buyer);
//     const response = await createOffer({
//       type: selectedBuyer.type,
//       buyer: selectedBuyer.buyer,
//       carIds,
//       admin_id: adminId,
//       admin_firstname: adminFirstname,
//       admin_lastname: adminLastname
//     });

//     if (response.success) setPdfLink(`http://localhost:5000${response.previewUrl}`);
//     if (response.success) setOfferId(response.offerId);
//     if (response.success) fetchOffers();
//   };


//   const handleSend = async (e) => {
//     e.preventDefault();
//     try {
//       console.log(offerId, client?.email);
//       await sendOfferEmail(offerId, client.email);
//       alert("Offer email sent to the client!");
//     } catch (err) {
//       console.error(err);
//       alert("Failed to send offer");
//     }
//   };


//   // ✅ Conditional rendering AFTER hooks
//   if (selectedCars.length === 0) {
//     return <p>Изберете автомобили.</p>;
//   }

//   return (
//     <div style={{ marginTop: 20 }}>
//       <form onSubmit={handleSubmit}>
//         {/* display all the clients and companies and choose for which of them the offer to be created*/}
//         <div className="form-group">
//   <label>Избери клиент:</label>
//   <select
//     onChange={(e) => {
//       const [type, id] = e.target.value.split("-");
//       if (type === "client") {
//         const buyerObj = clients.find((c) => c.id === Number(id));
//         setSelectedBuyer({ type, buyer: buyerObj });
//       } else if (type === "company") {
//         const buyerObj = companies.find((c) => c.id === Number(id));
//         setSelectedBuyer({ type, buyer: buyerObj });
//       } else {
//         setSelectedBuyer({ type: "", buyer: null });
//       }
//     }}
//   >
//     <option value="">-- Избери клиент --</option>
//     <optgroup label="Индивидуални клиенти">
//       {clients.map((c) => (
//         <option key={`c-${c.id}`} value={`client-${c.id}`}>
//           {c.first_name} {c.middle_name} {c.last_name} - {c.email} - {c.phone_number}
//         </option>
//       ))}
//     </optgroup>
//     <optgroup label="Фирми">
//       {companies.map((c) => (
//         <option key={`co-${c.id}`} value={`company-${c.id}`}>
//           {c.name} - {c.email} - {c.phone_number} - {c.rep_first_name} {c.rep_last_name}
//         </option>
//       ))}
//     </optgroup>
//   </select>
// </div>



//         {selectedCars.length > 0 && (
//           <button type="submit" disabled={selectedCars.length === 0}>Generate PDF</button>
//         )}
//       </form>

//       {pdfLink && (
//         <div style={{ marginTop: 10 }}>
//           <a href={pdfLink} target="_blank" rel="noopener noreferrer">Preview Offer PDF</a>
//         </div>
//       )}
        
//             <div style={{ marginTop: 10 }}>
//             <button onClick={handleSend}>Send Offer Email</button>
//             </div>
        
//     </div>
//   );
// }
