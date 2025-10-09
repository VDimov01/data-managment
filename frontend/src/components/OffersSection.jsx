// import { useState, useEffect } from "react";
// import OfferForm from "./OfferForm";
// import { fetchClients } from "../services/api";
// import { useData } from "../hooks/useData";


// export default function OffersSection() {
//   const [offers, setOffers] = useState([]);
//   const { clients, setClients, companies, setCompanies } = useData();
//   const [searchTerm, setSearchTerm] = useState("");
//   const [selectedCars, setSelectedCars] = useState([]);


//   const fetchOffers = async (clientQuery = "") => {
//     try {
//       const url = clientQuery
//         ? `http://localhost:5000/api/offers?client=${encodeURIComponent(clientQuery)}`
//         : `http://localhost:5000/api/offers?limit=10`;

//       const res = await fetch(url);
//       if (!res.ok) throw new Error("Failed to fetch offers");
//       const data = await res.json();
//       console.log(data);
//       setOffers(data.offers || []);
//     } catch (err) {
//       console.error("Error fetching offers:", err);
//     }
//   };

//   useEffect(() => {
//     fetchClients().then(setClients);
//     fetchOffers();
//   }, []);

//   const handleSearch = (e) => {
//     e.preventDefault();
//     fetchOffers(searchTerm);
//   };

//   const handleDeleteOffer = async (offer) => {
//     let type = "";
//     if (offer.client_uuid) {
//       type = "client";
//     } else if (offer.company_uuid) {
//       type = "company";
//     }

//     if(!confirm(`${type === "client" ? `${offer.client_firstname} ${offer.client_lastname} ${offer.car_ids.length} автомобил/ла \nСигурни ли сте, че искате да изтриете тази оферта?` : `${offer.company_name} ${offer.car_ids.length} автомобил/ла\nСигурни ли сте, че искате да изтриете тази оферта?`}`)) {
//       return;
//     }
//     try {
//       const res = await fetch(`http://localhost:5000/api/offers/${offer.uuid}`, {
//         method: "DELETE"
//       });
//       if (!res.ok) throw new Error("Failed to delete offer");
//       setOffers((prev) => prev.filter((o) => o.uuid !== offer.uuid));
//     } catch (err) {
//       console.error("Error deleting offer:", err);
//     }
//   };

//   const getCarCount = (car_ids) => {
//   if (!car_ids) return 0;

//   if (typeof car_ids === "string") {
//     try {
//       return JSON.parse(car_ids).length;
//     } catch {
//       return 0;
//     }
//   }

//   if (Array.isArray(car_ids)) return car_ids.length;

//   return 0;
// };

//   return (
//     <div>
//       <AvailableCars onCarSelect={(car) =>
//         setSelectedCars((prev) =>
//           prev.some((c) => c.id === car.id)
//             ? prev.filter((c) => c.id !== car.id)
//             : [...prev, car]
//         )
//       } multiSelect={true} addButton={false}/>

//       <h2 style={{ marginTop: "20px" }}>Създаване на оферта</h2>
//       <p style={{ fontWeight: "bold" }}>
//         Избрани автомобили: {selectedCars.map(car => `${car.maker} ${car.model} ${car.edition}`).join(", ")}
//       </p>
//       <OfferForm
//         selectedCars={selectedCars}
//         adminId={localStorage.getItem("adminUUID")}
//         adminFirstname={localStorage.getItem("firstname")}
//         adminLastname={localStorage.getItem("lastname")}
//         fetchOffers={fetchOffers}
        
//       />
      
//       <h2>Скорошни оферти</h2>

//       <form onSubmit={handleSearch} style={{ marginBottom: "15px" }}>
//         <input
//           type="text"
//           placeholder="Име на клиент или имейл..."
//           value={searchTerm}
//           onChange={(e) => setSearchTerm(e.target.value)}
//           style={{
//             padding: "8px 12px",
//             border: "1px solid #ccc",
//             borderRadius: "6px",
//             width: "250px",
//             marginRight: "10px"
//           }}
//         />
//         <button type="submit">Търсене</button>
//       </form>

//       {offers.length === 0 ? (
//         <p>Няма намерени оферти.</p>
//       ) : (
//         <table border="1" style={{ borderCollapse: "collapse", minWidth: "600px" }}>
//           <thead>
//             <tr>
//               <th>Име на клиент</th>
//               <th>Email</th>
//               <th>Автомобили</th>
//               <th>Преглед</th>
//               <th>Изтриване</th>
//             </tr>
//           </thead>
//           <tbody>
//             {offers.map((offer) => (
//               <tr key={offer.uuid}>
//                 <td>{offer.company_name ? offer.company_name : offer.client_firstname + " " + offer.client_lastname}</td>
//                 <td>{offer.client_email}</td>
//                 <td>{getCarCount(offer.car_ids)} автомобил/а</td>
//                 <td>
//                   <a
//                     href={`http://localhost:5000/${offer.pdf_path}`}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                   >
//                     Преглед
//                   </a>
//                 </td>
//                 <td>
//                   <button onClick={() => handleDeleteOffer(offer)}>Изтриване</button>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       )}
//     </div>
//   );
// }
